from __future__ import annotations

import re

from src.pdf import normalize_ocr_artefacts
from src.snippet import (
    _normalize_match_text,
    _normalize_inntak_navn,
    _guess_inntak_funksjon,
    _sanitize_inventory_name,
    _inventory_key,
    _split_group_inntak_names,
    _looks_like_generic_inntak_name,
    _looks_like_facility_label,
    _plant_name_is_facility_label,
    _extract_names_from_claim_text,
    extract_inntak_inventory,
    GENERIC_INNTAK_NAMES,
)

# ---------- Claim name resolution ----------


def _inventory_names_in_text(text: str, inventory: list[dict]) -> list[str]:
    if not text or not inventory:
        return []
    haystack = _normalize_match_text(text).lower()
    hits: list[tuple[int, str]] = []
    for item in inventory:
        name = item.get("navn")
        if not isinstance(name, str) or not name.strip():
            continue
        needle = _normalize_match_text(name).lower()
        if needle and needle in haystack:
            hits.append((len(needle), name))
    hits.sort(key=lambda pair: -pair[0])

    out: list[str] = []
    seen: set[str] = set()
    for _, name in hits:
        key = _inventory_key(name)
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def _inventory_names_near_claim_in_snippet(full_sitat: str, snippet: str, inventory: list[dict]) -> list[str]:
    if not full_sitat or not snippet or not inventory:
        return []
    claim_norm = _normalize_match_text(full_sitat).lower()
    snippet_norm = _normalize_match_text(snippet).lower()
    idx = snippet_norm.find(claim_norm)
    if idx == -1:
        return []
    window = snippet_norm[max(0, idx - 280):idx + len(claim_norm) + 280]
    return _inventory_names_in_text(window, inventory)


def _match_inventory_name(candidate: str, inventory: list[dict]) -> str | None:
    if not candidate:
        return None
    key = _inventory_key(candidate)
    if not key:
        return None

    best_name = None
    best_score = -1
    for item in inventory:
        name = item.get("navn")
        if not isinstance(name, str) or not name.strip():
            continue
        inv_key = _inventory_key(name)
        if inv_key == key:
            return name
        score = -1
        if key in inv_key or inv_key in key:
            score = min(len(key), len(inv_key))
        if score > best_score:
            best_score = score
            best_name = name
    return best_name if best_score >= 4 else None


def _resolve_claim_names(
    claim: dict,
    inventory: list[dict],
    snippet: str = "",
    plant_name: str | None = None,
) -> list[str]:
    raw_name = _normalize_match_text(claim.get("inntak_navn") or "")
    full_sitat = _normalize_match_text(claim.get("full_sitat") or "")
    strict_hits = _extract_names_from_claim_text(full_sitat, plant_name=plant_name)
    strict_hits = [
        name
        for name in strict_hits
        if not _looks_like_generic_inntak_name(name, plant_name=plant_name)
        and not _looks_like_facility_label(name)
    ]

    if strict_hits:
        if not inventory:
            return strict_hits
        resolved_strict: list[str] = []
        seen_strict: set[str] = set()
        for candidate in strict_hits:
            matched = _match_inventory_name(candidate, inventory)
            normalized = matched or candidate
            key = _inventory_key(normalized)
            if key in seen_strict:
                continue
            seen_strict.add(key)
            resolved_strict.append(normalized)
        if resolved_strict:
            return resolved_strict

    if inventory:
        direct_hits = _inventory_names_in_text(full_sitat, inventory)
        if direct_hits:
            return direct_hits

    candidates = _split_group_inntak_names(raw_name) if raw_name else []
    if not candidates and inventory:
        nearby_hits = _inventory_names_near_claim_in_snippet(full_sitat, snippet, inventory)
        if nearby_hits:
            return nearby_hits

    resolved: list[str] = []
    seen: set[str] = set()
    for candidate in candidates or [raw_name or "hovedinntak"]:
        matched = _match_inventory_name(candidate, inventory) if inventory else None
        if matched:
            key = _inventory_key(matched)
            if key not in seen:
                seen.add(key)
                resolved.append(matched)
            continue

        if _looks_like_generic_inntak_name(candidate, plant_name=plant_name):
            nearby_hits = _inventory_names_near_claim_in_snippet(full_sitat, snippet, inventory)
            if nearby_hits:
                for hit in nearby_hits:
                    key = _inventory_key(hit)
                    if key not in seen:
                        seen.add(key)
                        resolved.append(hit)
                continue

        normalized = _normalize_inntak_navn(candidate) or "hovedinntak"
        key = normalized.lower()
        if key not in seen:
            seen.add(key)
            resolved.append(normalized)

    if resolved:
        return resolved
    return ["hovedinntak"]


def _expand_and_map_claims(
    claims: list[dict],
    inventory: list[dict],
    snippet: str = "",
    plant_name: str | None = None,
) -> list[dict]:
    mapped_claims: list[dict] = []
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        resolved_names = _resolve_claim_names(
            claim,
            inventory=inventory,
            snippet=snippet,
            plant_name=plant_name,
        )
        for name in resolved_names:
            mapped = dict(claim)
            mapped["inntak_navn"] = name
            mapped["_source_inntak_navn"] = claim.get("inntak_navn")
            mapped_claims.append(mapped)
    return mapped_claims


# ---------- Entry builders ----------


def _blank_inntak_entry(name: str | None, inntak_funksjon: str | None, tilleggs: str | None = None) -> dict:
    return {
        "navn": None if name == "hovedinntak" else name,
        "inntakFunksjon": inntak_funksjon,
        "sommer_ls": None,
        "sommer_periode": None,
        "sommer_delperioder": [],
        "vinter_ls": None,
        "vinter_periode": None,
        "vinter_delperioder": [],
        "andre_krav": tilleggs or None,
    }


def _ensure_minimum_inntak(entries: list[dict] | None, tilleggs: str | None = None) -> list[dict]:
    normalized = list(entries or [])
    if normalized:
        return normalized
    return [_blank_inntak_entry(None, None, tilleggs)]


def _delperiode_entry(ls: float | None = None, periode: str | None = None, tekst: str | None = None) -> dict:
    return {
        "ls": ls,
        "periode": periode,
        "tekst": tekst,
    }


# ---------- Unit conversion ----------


def claim_to_ls(tall, enhet: str | None, full_sitat: str | None = None) -> float | None:
    if tall is None:
        return None
    try:
        val = float(tall)
    except (ValueError, TypeError):
        return None

    if full_sitat:
        if val >= 11 and val == int(val):
            m = re.search(r"(\d+)\s*1\s*/?\s*s\b", full_sitat)
            if m:
                try:
                    broken_val = float(m.group(1))
                    if int(val) == int(float(m.group(1) + "1")):
                        val = broken_val
                except ValueError:
                    pass
        if val != int(val):
            int_part = int(val)
            decimal_part = round(val - int_part, 3)
            if 0.05 <= decimal_part <= 0.55:
                m = re.search(rf"(?<!\d){int_part}\s*1\s*/\s*[sS5]", full_sitat)
                if m:
                    val = float(int_part)

    u = (enhet or "").lower().replace(" ", "")
    is_m3 = False
    if "m3" in u or "m³" in u or "kubikk" in u or "m2" in u or "m²" in u:
        is_m3 = True
    elif re.fullmatch(r"m[*'`´]/s(ek)?", u):
        is_m3 = True
    elif re.fullmatch(r"m''/s(ek)?", u):
        is_m3 = True
    elif re.fullmatch(r"mf/s(ek)?", u):
        is_m3 = True
    elif re.fullmatch(r"m/s(ek)?", u) and val < 20:
        is_m3 = True

    if is_m3:
        return val * 1000.0
    return val


def format_ls(val_ls: float | None) -> str:
    if val_ls is None:
        return "—"
    if val_ls == int(val_ls):
        return f"{int(val_ls)} l/s"
    return f"{val_ls:.1f} l/s"


# ---------- Period classification ----------

_SUMMER_MONTHS = {5, 6, 7, 8, 9}
_WINTER_MONTHS = {1, 2, 3, 4, 10, 11, 12}

_NO_MONTH_NAMES = {
    "januar": 1, "jan": 1, "februar": 2, "feb": 2, "mars": 3, "mar": 3,
    "april": 4, "apr": 4, "mai": 5, "juni": 6, "jun": 6, "juli": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "oktober": 10, "okt": 10,
    "november": 11, "nov": 11, "desember": 12, "des": 12,
}


def _parse_period_start_month(period_text: str | None) -> int | None:
    if not period_text:
        return None
    t = period_text.lower()
    m = re.search(r"(\d{1,2})\s*[./]\s*(\d{1,2})", t)
    if m:
        try:
            month = int(m.group(2))
            if 1 <= month <= 12:
                return month
        except ValueError:
            pass
    first_pos = None
    first_month = None
    for name, num in _NO_MONTH_NAMES.items():
        idx = t.find(name)
        if idx != -1 and (first_pos is None or idx < first_pos):
            first_pos = idx
            first_month = num
    return first_month


def _parse_period_end_month(period_text: str | None) -> int | None:
    if not period_text:
        return None
    t = period_text.lower()
    matches = list(re.finditer(r"(\d{1,2})\s*[./]\s*(\d{1,2})", t))
    if len(matches) >= 2:
        try:
            month = int(matches[1].group(2))
            if 1 <= month <= 12:
                return month
        except ValueError:
            pass
    first_pos = None
    last_pos = -1
    last_month = None
    for name, num in _NO_MONTH_NAMES.items():
        start = 0
        while True:
            idx = t.find(name, start)
            if idx == -1:
                break
            if first_pos is None or idx < first_pos:
                first_pos = idx
            if idx > last_pos:
                last_pos = idx
                last_month = num
            start = idx + 1
    if last_month is not None and first_pos is not None and last_pos > first_pos:
        return last_month
    return None


def _months_covered(start_month: int, end_month: int) -> set[int]:
    if end_month >= start_month:
        return set(range(start_month, end_month + 1))
    return set(range(start_month, 13)) | set(range(1, end_month + 1))


def _classify_period(period_text: str | None, fallback_text: str | None = None) -> str:
    def _classify_one(text: str | None) -> str:
        if not text:
            return "ukjent"
        t = text.lower().strip()
        if ("hele året" in t or "heile året" in t or "helårlig" in t or "hele aaret" in t
                or "hver tid" in t or "enhver tid" in t or "til enhver" in t or "til en hver" in t):
            return "helar"
        if t in {"sommer", "sommar", "sommerhalvåret", "sommerhalvaret"}:
            return "sommer"
        if t in {"vinter", "vinterhalvåret", "vinterhalvaret"}:
            return "vinter"
        if "resten av året" in t or "resten av aaret" in t or "øvrig" in t or "den øvrige tid" in t:
            return "vinter"
        start_month = _parse_period_start_month(t)
        if start_month is None:
            return "ukjent"
        end_month = _parse_period_end_month(t)
        if end_month is None:
            if start_month in _SUMMER_MONTHS:
                return "sommer"
            return "vinter"
        covered = _months_covered(start_month, end_month)
        summer_overlap = covered & _SUMMER_MONTHS
        winter_overlap = covered & _WINTER_MONTHS
        if summer_overlap and not winter_overlap:
            return "sommer"
        if len(summer_overlap) >= 3:
            return "sommer"
        return "vinter"

    if not period_text and not fallback_text:
        return "helar"

    primary = _classify_one(period_text)
    if primary != "ukjent":
        return primary
    if fallback_text:
        return _classify_one(fallback_text)
    return "ukjent"


def _complement_period(other_period: str | None) -> str | None:
    if not other_period:
        return None
    m = re.search(r"(\d{1,2})\s*[./]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[./]\s*(\d{1,2})", other_period)
    if not m:
        return None
    try:
        _, _, end_d, end_m = (int(x) for x in m.groups())
    except ValueError:
        return None
    d, mo = end_d + 1, end_m
    if d > 30:
        d = 1
        mo = mo + 1 if mo < 12 else 1
    sm = re.search(r"^\s*(\d{1,2})\s*[./]\s*(\d{1,2})", other_period)
    if not sm:
        return None
    try:
        start_d, start_m = int(sm.group(1)), int(sm.group(2))
    except ValueError:
        return None
    e_d = start_d - 1
    e_m = start_m
    if e_d < 1:
        e_d = 30
        e_m = e_m - 1 if e_m > 1 else 12
    return f"{d}.{mo} – {e_d}.{e_m}"


MONTHS_MAP = {
    'januar': '01', 'februar': '02', 'mars': '03', 'april': '04',
    'mai': '05', 'juni': '06', 'juli': '07', 'august': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'desember': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'jun': '06', 'jul': '07', 'aug': '08', 'sept': '09',
    'okt': '10', 'nov': '11', 'des': '12',
}


def _normalize_periode_str(p: str) -> str | None:
    if not p:
        return None
    p = p.replace("–", "-").replace("—", "-").strip()
    low = p.lower()
    low = low.rstrip(" -–—")
    if low in ('hele året', 'hele aret', 'hele aaret'):
        return 'hele året'
    if low in ('resten av året', 'resten av aret'):
        return 'resten av året'
    simple_map = {
        'sommer': '01.05 - 30.09',
        'sommeren': '01.05 - 30.09', 'sommerhalvåret': '01.05 - 30.09',
        'sommerperioden': '01.05 - 30.09', 'sommersesongen': '01.05 - 30.09',
        'vinter': '01.10 - 30.04',
        'vinteren': '01.10 - 30.04', 'mai - september': '01.05 - 30.09',
        'oktober - april': '01.10 - 30.04',
    }
    if low in simple_map:
        return simple_map[low]
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.?\s*-\s*(\d{1,2})\.(\d{1,2})\.?$', p)
    if m:
        return f'{int(m.group(1)):02d}.{int(m.group(2)):02d} - {int(m.group(3)):02d}.{int(m.group(4)):02d}'
    m = re.match(r'(\d{1,2})\.?\s*([a-zæøå]+)\s*-\s*(\d{1,2})\.?\s*([a-zæøå]+)', p, re.I)
    if m:
        d1, m1, d2, m2 = m.group(1), m.group(2).lower().rstrip('.'), m.group(3), m.group(4).lower().rstrip('.')
        if m1 in MONTHS_MAP and m2 in MONTHS_MAP:
            return f'{int(d1):02d}.{MONTHS_MAP[m1]} - {int(d2):02d}.{MONTHS_MAP[m2]}'
    if 'vårflom' in low or 'vaarflom' in low:
        return '01.05 - 30.09' if 'september' in low else '01.05 - 30.09'
    return p


# ---------- Main assembly ----------


def assemble_inntak_from_claims(
    llm: dict,
    snippet: str = "",
    inventory: list[dict] | None = None,
    plant_name: str | None = None,
) -> dict:
    inventory = list(inventory or [])
    if not isinstance(llm, dict):
        return {
            "funnet": False,
            "grunn": "llm not a dict",
            "inntak": _ensure_minimum_inntak([
                _blank_inntak_entry(item.get("navn"), item.get("inntakFunksjon"))
                for item in inventory
            ]),
        }

    claims = llm.get("claims") or []
    if not inventory:
        inventory = extract_inntak_inventory(snippet, plant_name=plant_name, claims=claims)

    tilleggs = llm.get("tilleggs_krav") or ""

    if not llm.get("funnet"):
        return {
            "funnet": False,
            "grunn": llm.get("grunn", "ingen krav nevnt i dokumentet"),
            "inntak": _ensure_minimum_inntak([
                _blank_inntak_entry(item.get("navn"), item.get("inntakFunksjon"), tilleggs)
                for item in inventory
            ], tilleggs),
        }

    INVALID_UNITS = re.compile(
        r"timer|time|kwh|mwh|kw\b|mw\b|watt|meter\b|kubikk\s*meter\s*$|prosent|%|år\b|dager"
        r"|\bcm\b|\bmm\b|\bkm\b|\bm\b(?!\s*[³3*'`´]?\s*/\s*s)"
        r"|moh|kote|hoyde|høyde|kph|km/t"
        r"|pst\b|stk\b",
        re.I,
    )
    VALID_FLOW_UNIT = re.compile(
        r"^([lI]\s*/?\s*s|1\s*/?\s*s|vs|v\s*/\s*s|m\s*[³3*'`´]?\s*/?\s*s|kubikk)",
        re.I,
    )
    SLIPP_TRIGGER_RE = re.compile(
        r"slipp|minstevannf|p[åa]legg|fastsett|pålagt|vannslipp",
        re.I,
    )
    CAP_MARKER_RE = re.compile(
        r"spyleflom|tappeflom|flomtapping|opprenskingsflom|slukeevne"
        r"|\b[eé]n\s+gang\s+(?:pr\.?|per|i)\s+[åa]r"
        r"|\binntil\b|\bmaksimalt\b|\bmaks\.?\b|\bhøyst\b|\bikke\s+overskride\b"
        r"|\bkan\s+varier(?:e|es)\b|\boverføringskapasitet\b",
        re.I,
    )
    AVG_CAP_RE = re.compile(
        r"\binntil\b.{0,80}\bi\s+gjennomsnitt\b|\bi\s+gjennomsnitt\b.{0,80}\binntil\b",
        re.I,
    )
    INNTIL_VALUE_RE = re.compile(
        r"\binntil\s+\d+[.,]?\d*\s*(?:m3/s|m³/s|l/s|m\s*[²³2-9]\s*/\s*s)",
        re.I,
    )
    MIN_MARKER_RE = re.compile(
        r"minstevannf[øo]ring|minstevassf[øo]ring"
        r"|minst\s+\d|ikke\s+mindre\s+enn|ikke\s+under(?:skride)?|minimum"
        r"|skal\s+(?:til\s+enhver\s+tid\s+)?slippes"
        r"|\bslipp(?:es|ing|e)?\s+(?:av\s+)?(?:minst\s+)?\d"
        r"|forbi\s+inntak|forbi\s+dam"
        r"|skal\s+g[åa]\s+minst|skal\s+halde\s+minst"
        r"|ikke\s+g[åa]\s+under|skal\s+opprettholdes",
        re.I,
    )

    def _is_valid_claim(c):
        if not isinstance(c, dict):
            return False
        tall = c.get("tall")
        if tall is None:
            return False
        try:
            float(tall)
        except (TypeError, ValueError):
            return False
        enhet = (c.get("enhet") or "").strip()
        if INVALID_UNITS.search(enhet):
            return False
        sitat = (c.get("full_sitat") or "")
        period = (c.get("periode_sitat") or "")
        combined = f"{sitat} {period}"
        if AVG_CAP_RE.search(combined):
            return False
        if INNTIL_VALUE_RE.search(combined) and not MIN_MARKER_RE.search(combined.replace("inntil", "")):
            return False
        if CAP_MARKER_RE.search(combined) and not MIN_MARKER_RE.search(combined):
            return False
        if VALID_FLOW_UNIT.match(enhet):
            return True
        if not SLIPP_TRIGGER_RE.search(sitat.lower()):
            return False
        return True

    valid_claims = [c for c in claims if _is_valid_claim(c)]
    if not valid_claims:
        return {
            "funnet": False,
            "grunn": "ingen gyldige slipp-krav i dokumentet",
            "inntak": _ensure_minimum_inntak([
                _blank_inntak_entry(item.get("navn"), item.get("inntakFunksjon"), tilleggs)
                for item in inventory
            ], tilleggs),
        }

    claims = _expand_and_map_claims(
        valid_claims,
        inventory=inventory,
        snippet=snippet,
        plant_name=plant_name,
    )

    if snippet:
        snippet_lower = snippet.lower()

        def _claim_is_grounded(c):
            navn = (c.get("inntak_navn") or "").strip().lower()
            raw_source_navn = _normalize_match_text(c.get("_source_inntak_navn") or "")
            source_navn = raw_source_navn.lower()
            if not navn or navn == "hovedinntak":
                return True
            tall = c.get("tall")
            if tall is None:
                return False
            tall_str = str(tall)
            variants = {tall_str}
            if "." in tall_str:
                variants.add(tall_str.replace(".", ","))
            else:
                variants.add(tall_str.replace(",", "."))
            anchor_names = [navn]
            if navn not in snippet_lower:
                if source_navn and source_navn in snippet_lower:
                    split_source = [
                        _normalize_match_text(part).lower()
                        for part in _split_group_inntak_names(raw_source_navn)
                    ]
                    if navn in split_source:
                        anchor_names = [source_navn]
                    else:
                        return False
                else:
                    return False
            for anchor in anchor_names:
                idx = 0
                while True:
                    pos = snippet_lower.find(anchor, idx)
                    if pos == -1:
                        break
                    window = snippet_lower[max(0, pos - 300):pos + 300]
                    if any(v and v in window for v in variants):
                        return True
                    idx = pos + 1
            return False

        grounded = [c for c in claims if _claim_is_grounded(c)]
        if grounded:
            claims = grounded

    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for c in claims:
        raw_navn = (c.get("inntak_navn") or "").strip()
        if not raw_navn:
            raw_navn = "hovedinntak"
        navn = _normalize_inntak_navn(raw_navn) or "hovedinntak"
        if navn not in groups:
            groups[navn] = []
            order.append(navn)
        groups[navn].append(c)

    merged_order: list[str] = []
    merged_groups: dict[str, list[dict]] = {}
    for navn in order:
        matched = False
        for existing in merged_order:
            if (navn.lower() in existing.lower() or existing.lower() in navn.lower()) and navn != existing:
                merged_groups[existing].extend(groups[navn])
                matched = True
                break
        if not matched:
            merged_order.append(navn)
            merged_groups[navn] = list(groups[navn])

    specific = [n for n in merged_order if n != "hovedinntak"]
    if "hovedinntak" in merged_order and len(specific) == 1:
        merged_groups[specific[0]].extend(merged_groups.pop("hovedinntak"))
        merged_order.remove("hovedinntak")

    order = merged_order
    groups = merged_groups

    inventory_order: list[str] = []
    inventory_lookup: dict[str, dict] = {}
    for item in inventory:
        item_name = _normalize_inntak_navn(item.get("navn") or "") or "hovedinntak"
        if item_name not in inventory_lookup:
            inventory_lookup[item_name] = item
            inventory_order.append(item_name)

    final_order = inventory_order + [name for name in order if name not in inventory_lookup]

    inntak_out = []
    claim_found = False
    for navn in final_order:
        group = groups.get(navn, [])
        inventory_item = inventory_lookup.get(navn) or {}
        inntak_funksjon = inventory_item.get("inntakFunksjon") or _guess_inntak_funksjon(navn)
        if not group:
            inntak_out.append(_blank_inntak_entry(navn, inntak_funksjon, tilleggs))
            continue

        claim_found = True
        sommer_items: list[str] = []
        vinter_items: list[str] = []
        sommer_period = None

        classified = []
        for c in group:
            val_ls = claim_to_ls(c.get("tall"), c.get("enhet"), c.get("full_sitat"))
            period_text = (c.get("periode_sitat") or "").strip()
            full_sitat = (c.get("full_sitat") or "").strip()
            kind = _classify_period(period_text, fallback_text=full_sitat)
            classified.append((kind, val_ls, period_text))

        ukjent_queue: list[tuple[float, str]] = []
        for kind, val_ls, period_text in classified:
            if val_ls is None:
                continue
            if kind == "helar":
                s = f"{format_ls(val_ls)} (hele året)"
                sommer_items = [s]
            elif kind == "sommer":
                sommer_items.append(f"{format_ls(val_ls)} ({period_text})")
                sommer_period = period_text
            elif kind == "vinter":
                if period_text.lower().startswith("resten") and sommer_period:
                    comp = _complement_period(sommer_period)
                    vinter_items.append(
                        f"{format_ls(val_ls)} ({comp})" if comp else f"{format_ls(val_ls)} (resten av året)"
                    )
                else:
                    vinter_items.append(f"{format_ls(val_ls)} ({period_text})")
            else:
                ukjent_queue.append((val_ls, period_text))

        for val_ls, period_text in ukjent_queue:
            target = f"{format_ls(val_ls)} ({period_text})" if period_text else format_ls(val_ls)
            if not sommer_items and not vinter_items:
                s = f"{format_ls(val_ls)} (hele året, antatt)"
                sommer_items = [s]
            elif not sommer_items:
                sommer_items.append(target)
            elif not vinter_items:
                vinter_items.append(target)

        if vinter_items:
            if sommer_period:
                comp = _complement_period(sommer_period)
                if comp:
                    vinter_items = [item.replace("resten av året", comp) for item in vinter_items]

        def _parse_bucket_items(items: list[str], season: str) -> list[dict]:
            parsed: list[dict] = []
            for item in list(dict.fromkeys(items)):
                ls_match = re.match(r'([\d.,]+)\s*(?:l/s)?', item)
                ls_val = float(ls_match.group(1).replace(',', '.')) if ls_match else None
                period_match = re.search(r'\(([^)]+)\)', item)
                period = period_match.group(1) if period_match else None
                period = period.strip() if period else period
                if period and "resten av" in period.lower() and sommer_period:
                    comp = _complement_period(sommer_period)
                    if comp and season == "vinter":
                        period = comp
                if period:
                    period = _normalize_periode_str(period)
                parsed.append(_delperiode_entry(ls=ls_val, periode=period, tekst=item))
            return parsed

        def _summarize_bucket(details: list[dict]) -> tuple[float | None, str | None]:
            if not details:
                return None, None
            if len(details) == 1:
                return details[0]["ls"], details[0]["periode"]
            unique_vals = {d["ls"] for d in details if d.get("ls") is not None}
            unique_periods = [d.get("periode") for d in details if d.get("periode")]
            if len(unique_vals) == 1:
                return next(iter(unique_vals)), "; ".join(dict.fromkeys(unique_periods))
            return None, None

        sommer_details = _parse_bucket_items(sommer_items, "sommer")
        vinter_details = _parse_bucket_items(vinter_items, "vinter")
        sommer_ls, sommer_periode = _summarize_bucket(sommer_details)
        vinter_ls, vinter_periode = _summarize_bucket(vinter_details)
        if sommer_periode:
            sommer_periode = _normalize_periode_str(sommer_periode)
        if vinter_periode == "resten av året" and sommer_periode:
            vinter_periode = _complement_period(sommer_periode) or vinter_periode
            if vinter_details:
                for detail in vinter_details:
                    if detail.get("periode") == "resten av året":
                        detail["periode"] = vinter_periode
        if vinter_periode:
            vinter_periode = _normalize_periode_str(vinter_periode)
            for detail in vinter_details:
                if detail.get("periode"):
                    detail["periode"] = _normalize_periode_str(detail["periode"])

        inntak_out.append({
            "navn": None if navn == "hovedinntak" else navn,
            "inntakFunksjon": inntak_funksjon,
            "sommer_ls": sommer_ls,
            "sommer_periode": sommer_periode,
            "sommer_delperioder": sommer_details,
            "vinter_ls": vinter_ls,
            "vinter_periode": vinter_periode,
            "vinter_delperioder": vinter_details,
            "andre_krav": tilleggs or None,
        })

    return {
        "funnet": claim_found,
        "inntak": _ensure_minimum_inntak(inntak_out, tilleggs),
    }
