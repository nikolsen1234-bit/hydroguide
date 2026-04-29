from __future__ import annotations

import re

from src.models import MAX_TEXT_CHARS
from src.pdf import normalize_ocr_artefacts

# ---------- Relevance / boilerplate / noise patterns ----------

RELEVANCE_PATTERNS = re.compile(
    r"minstevannf[øo]ring"
    r"|minstevassf[øo]ring"
    r"|vannslipp"
    r"|vass[- ]?slipp"
    r"|skal\s+slippes"
    r"|slipp\w*\s+\d"
    r"|slippes\s+\w*\s*\d"
    r"|p[åa]legges"
    r"|p[åa]lagt"
    r"|fastsett(e|er|es)"
    r"|forbi\s+inntak"
    r"|forbi\s+dam"
    r"|fra\s+inntaksdam"
    r"|forbi\s+magasin"
    r"|forbi\s+kraftverk"
    r"|forbi\s+kraftstasjon"
    r"|nedstr[øo]ms\s+(?:inntak|dam|kraftverk|kraftstasjon)"
    r"|resten\s+av\s+[åa]ret"
    r"|(?:vannf[øo]ring|vassf[øo]ring)[^.]{0,80}?(?:skal|ikke)\s+(?:underskride|gå\s+under)"
    r"|skal\s+gå\s+minst"
    r"|skal\s+ikke\s+underskride"
    r"|(?:vannf[øo]ring|vassf[øo]ring)\s+(?:ved|forbi|i)\s+[^.]{0,40}?\s*\d"
    r"|i\s+tiden\s+\d"
    r"|i\s+perioden\s+\d"
    r"|tidsrommet\s+fra"
    r"|vert\s+halden"
    r"|skal\s+haldast"
    r"|skal\s+halde"
    r"|vert\s+sleppt"
    r"|skal\s+sleppast"
    r"|sleppe\s+\w*\s*\d",
    re.I,
)

BOILERPLATE_PATTERNS = re.compile(
    r"m[åa]leanordning\s+for\s+registrering"
    r"|opplysningsskilt"
    r"|skiltenes\s+utforming"
    r"|bortfall\s+av\s+konsesjon"
    r"|hjelpeanlegg"
    r"|utg[åa]ende\s+ledning",
    re.I,
)

STRUCTURE_NOISE = re.compile(
    r"\bkote[-rtn ]?\s*\d"
    r"|\bHRV\b"
    r"|\bLRV\b"
    r"|\bm\.?o\.?h\.?\b"
    r"|\bNN\s*1954\b"
    r"|\bNN\s*2000\b"
    r"|reguleringsh[øo]yde"
    r"|reguleringsgrense"
    r"|oppdemning"
    r"|oppdemming"
    r"|senkning"
    r"|nedre\s+kote"
    r"|øvre\s+kote"
    r"|flomluke"
    r"|flomtapping"
    r"|flomlop"
    r"|flomløp"
    r"|slukeevne"
    r"|maks\s*imal\s+slukeevne"
    r"|overf[øo]ringskapasitet"
    r"|driftsvannf[øo]ring"
    r"|produksjonsvann"
    r"|installert\s+effekt"
    r"|maks\s+ytelse"
    r"|nedb[øo]rfelt"
    r"|\bbrukstid\b"
    r"|\btimer\s+[åa]rlig\b"
    r"|varere\s+inntil"
    r"|vannstand(en)?\s+kan\s+variere"
    r"|\btransport\s+av\s+vann\b"
    r"|energi\s*ekvivalent",
    re.I,
)

HEADING_PATTERNS = re.compile(
    r"^\s*\d+\.\s*\(?[A-ZÆØÅ]"
    r"|^\s*[A-ZÆØÅ][A-Za-zæøå\-]+(?:\s+[A-ZÆØÅ][A-Za-zæøå\-]+)*\s+kraftverk\b"
    r"|^\s*\([A-ZÆØÅ]"
    r"|^\s*Vannslipping\b"
    r"|^\s*Vassdragskonsesjon\b",
    re.I,
)

VEDTAK_RE = re.compile(
    r"vilk[åa]r|vedtak|man[øo]vreringsreglement|fastsett|p[åa]legg",
    re.I,
)

# ---------- Sentence splitting ----------


def _split_sentences(text: str) -> list[tuple[int, str]]:
    sentences = []
    i = 0
    buf_start = 0
    while i < len(text):
        ch = text[i]
        if ch in ".:\n" and i + 1 < len(text):
            nxt = text[i+1]
            if nxt.isspace() or nxt.isupper() or nxt == '\n':
                s = text[buf_start:i+1].strip()
                if s:
                    sentences.append((buf_start, s))
                buf_start = i + 1
        i += 1
    tail = text[buf_start:].strip()
    if tail:
        sentences.append((buf_start, tail))
    return sentences


def _is_heading(sentence: str) -> bool:
    if len(sentence) > 120:
        return False
    return bool(HEADING_PATTERNS.search(sentence))


# ---------- Keyword windowing ----------


def find_relevant_window(text: str, plant_name: str | None = None) -> tuple[str, str]:
    if not text:
        return "", "empty"

    sentences = _split_sentences(text)
    if not sentences:
        return text[:MAX_TEXT_CHARS], "head"

    filtered = [(i, s) for i, (_, s) in enumerate(sentences) if not STRUCTURE_NOISE.search(s)]
    if not filtered:
        return text[:6000], "head_fallback"

    surviving = [s for _, s in filtered]

    relevant_idx = set()
    for new_i, s in enumerate(surviving):
        if BOILERPLATE_PATTERNS.search(s):
            continue
        if RELEVANCE_PATTERNS.search(s):
            relevant_idx.add(new_i)

    if not relevant_idx:
        head = text[:4000]
        return head, "head_fallback"

    kept = set()
    for i in relevant_idx:
        for k in range(max(0, i - 3), min(len(surviving), i + 4)):
            kept.add(k)

    for new_i, s in enumerate(surviving):
        if not _is_heading(s):
            continue
        nearest = min((abs(new_i - r) for r in relevant_idx), default=999)
        if nearest <= 8:
            kept.add(new_i)

    kept_sorted = sorted(kept)
    chunks = []
    current_block = []
    prev = None
    for i in kept_sorted:
        if prev is not None and i - prev > 5:
            chunks.append(" ".join(current_block))
            current_block = []
        elif prev is not None:
            for k in range(prev + 1, i):
                current_block.append(surviving[k])
        current_block.append(surviving[i])
        prev = i
    if current_block:
        chunks.append(" ".join(current_block))

    TAIL_CHARS = 7000
    if len(text) > MAX_TEXT_CHARS * 2:
        tail = text[-TAIL_CHARS:]
        if RELEVANCE_PATTERNS.search(tail):
            chunks.append(tail)

    if plant_name and len(plant_name.strip()) > 3 and len(chunks) > 1:
        pn_lower = plant_name.strip().lower()
        name_chunks = [c for c in chunks if pn_lower in c.lower()]
        other_chunks = [c for c in chunks if pn_lower not in c.lower()]
        if name_chunks:
            chunks = name_chunks + other_chunks

    snippet = "\n\n".join(chunks)

    if len(snippet) > MAX_TEXT_CHARS:
        scored = []
        pn_lower = (plant_name or "").strip().lower() if plant_name else ""
        for i, chunk in enumerate(chunks):
            vedtak_hits = len(VEDTAK_RE.findall(chunk))
            name_bonus = 5 if pn_lower and len(pn_lower) > 3 and pn_lower in chunk.lower() else 0
            scored.append((vedtak_hits + name_bonus, i, chunk))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        selected = []
        total = 0
        for _, orig_idx, chunk in scored:
            if total + len(chunk) > MAX_TEXT_CHARS:
                remaining = MAX_TEXT_CHARS - total
                if remaining > 200:
                    selected.append((orig_idx, chunk[:remaining]))
                    total += remaining
                break
            selected.append((orig_idx, chunk))
            total += len(chunk)
        selected.sort(key=lambda x: x[0])
        snippet = "\n\n".join(c for _, c in selected)
        return snippet, "relevance_truncated"

    return snippet, "relevance_snippet"


# ---------- Name helpers (shared with assembly) ----------

GENERIC_INNTAK_NAMES = {
    "aurland",
    "dam",
    "dammen",
    "heile tilsiget",
    "hele tilsiget",
    "hovedinntak",
    "hovedinntaket",
    "inntak",
    "inntaket",
    "inntaksdammen",
    "kraftstasjonen",
    "kraftverket",
    "magasinet",
    "tilsiget",
}

INNTAK_DIRECTION_WORDS = {
    "austre",
    "fremre",
    "fremste",
    "heimre",
    "indre",
    "midtre",
    "nedre",
    "nordre",
    "søndre",
    "søre",
    "vestre",
    "ytre",
    "østre",
    "øvre",
}

INNTAK_STOPWORDS = {
    "alle",
    "av",
    "betingelser",
    "dataene",
    "detskal",
    "delperioden",
    "der",
    "dette",
    "det",
    "dersom",
    "dertas",
    "deres",
    "etter",
    "fastsatt",
    "for",
    "fra",
    "hele",
    "hvorav",
    "høydene",
    "inkl",
    "i",
    "kommunen",
    "konsesjonen",
    "konsesjonæren",
    "kraftverket",
    "medhold",
    "nve",
    "offentlige",
    "reglementet",
    "samtlige",
    "side",
    "til",
    "tas",
    "vedkommende",
}

STRICT_CLAIM_NAME_PATTERNS = [
    re.compile(
        r"\b(?:fra|forbi\s+inntak(?:et|ene)?\s+i)\s+(.{1,80}?)(?=\s+(?:skal\s+(?:det\s+)?slippes|skal\s+vass?f[øo]ringen|ikke\s+underskride|skal\s+ikke\s+underskride|skal\s+holdes|hele\s+året|heile\s+året|i\s+perioden|i\s+tiden|resten\s+av\s+året|p[åa]\s+(?:minimum|\d))|[.,;:])",
        re.I,
    ),
    re.compile(
        r"\b([A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-() ]{1,70}?)\s*gis\s*en\s*minstevassf\S*",
        re.I,
    ),
    re.compile(
        r"\b([A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-() ]{1,70}?)\s*gis\s*en\s*minstevannf\S*",
        re.I,
    ),
    re.compile(
        r"\bvass?f[øo]ringen\s+ved\s+(.{1,70}?)(?=\s+(?:ikke\s+underskride|skal\s+ikke\s+underskride|skal\s+holdes|skal\s+opprettholdes))",
        re.I,
    ),
    re.compile(
        r"\b(hovedinntaket|hovedinntak|inntaket|inntaksdammen)\b(?=\s+skal\s+(?:det\s+)?slippes)",
        re.I,
    ),
]

INVENTORY_SECTION_HEADING_RE = re.compile(
    r"\b(?:reguleringsmagasiner|overf[øo]ringer|inntak(?:\s+og\s+overf[øo]ringer)?)\b",
    re.I,
)

INVENTORY_SECTION_RESET_RE = re.compile(
    r"^\s*(?:[A-Z]\.|[0-9]+\.)\s+",
)

MAGASIN_TABLE_LINE_RE = re.compile(
    r'^\s*["«]?([A-ZÆØÅ][A-Za-zÆØÅæøå0-9,\-."«» ]{1,60}?)["»]?\s+\d[\d ,.]*\s+\d',
)

OVERFORING_ENTRY_PATTERNS = [
    re.compile(
        r"(?:avl[øo]pet|avlopet)\s*fra\s+(.{1,80}?)(?=\s*ved(?:kote)?\b|\s*\(\s*(?:ca\.\s*)?\d+[.,]?\d*\s*km2|\s*f[øo]res\b|\s*overf[øo]res\b|,)",
        re.I,
    ),
    re.compile(
        r"([A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-()]+(?:\s+(?:[A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-()]+|[Nn]edre|[Øø]vre|[Vv]estre|[Øø]stre|[Nn]ordre|[Ss]øndre|[Yy]tre|[Ii]ndre|[Mm]idtre)){0,3})(?=\s*ved(?:kote)?\b)"
    ),
]


def _normalize_match_text(text: str) -> str:
    t = normalize_ocr_artefacts(text or "")
    t = t.replace("—", "-").replace("–", "-")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _normalize_inntak_navn(raw: str) -> str:
    t = raw.strip()
    t = re.sub(
        r"^(?:fra\s+)?(?:dammen\s+(?:i|ved)\s+|inntaket\s+(?:i|ved)\s+|magasinet\s+|forbi\s+)",
        "", t, flags=re.I,
    ).strip()
    generic = {
        "tilsiget",
        "hele tilsiget",
        "inntaket",
        "inntak",
        "inntaksdammen",
        "dammen",
        "hovedinntak",
        "dam",
        "kraftverket",
        "kraftstasjonen",
        "kraftverk",
        "kraftstasjon",
        "anlegget",
        "anlegg",
    }
    if t.lower() in generic:
        return "hovedinntak"
    return t or "hovedinntak"


def _guess_inntak_funksjon(name: str | None) -> str | None:
    if not name:
        return None
    lowered = name.lower()
    if "overføring" in lowered or "overforing" in lowered:
        return "overføring"
    if "inntak" in lowered:
        return "inntak"
    if "magasin" in lowered or "vatn" in lowered or "vatnet" in lowered or "votni" in lowered:
        return "magasin"
    return None


def _looks_like_facility_label(name: str) -> bool:
    lowered = _normalize_match_text(name).lower()
    if not lowered:
        return False
    return bool(
        re.search(
            r"\b(?:kraftverk(?:et)?|kraftstasjon(?:en)?|stasjonen|anlegget|anlegg)\b",
            lowered,
            re.I,
        )
    )


def _plant_name_is_facility_label(name: str | None) -> bool:
    lowered = _normalize_match_text(name or "").lower()
    if not lowered:
        return False
    if _looks_like_facility_label(lowered):
        return True
    if re.search(r"\b\d+\b", lowered):
        return True
    if re.search(r"\b(?:i|ii|iii|iv|v|vi|vii|viii|ix|x|l)\b", lowered):
        return True
    return False


def _looks_like_generic_inntak_name(name: str, plant_name: str | None = None) -> bool:
    lowered = _normalize_match_text(name).lower()
    if not lowered:
        return True
    if lowered in GENERIC_INNTAK_NAMES:
        return True
    if plant_name:
        plant_lower = _normalize_match_text(plant_name).lower()
        if plant_lower and _plant_name_is_facility_label(plant_name) and (
            lowered == plant_lower
            or plant_lower.startswith(lowered + " ")
            or lowered.startswith(plant_lower + " ")
        ):
            return True
    return False


def _split_group_inntak_names(raw: str) -> list[str]:
    s = _normalize_match_text(raw)
    if not s:
        return []
    s = re.sub(r"([a-zæøå])og([A-ZÆØÅ])", r"\1 og \2", s)
    s = re.sub(r",(?=[A-ZÆØÅ])", ", ", s)

    out: list[str] = []
    if "/" in s and not re.search(r"\d/\d", s):
        parts = [part.strip() for part in re.split(r"\s*/\s*", s) if part.strip()]
        if len(parts) >= 2:
            out.extend(parts)
            return out

    if " og " not in s:
        return [s]

    parts = [part.strip() for part in re.split(r"\s+og\s+", s) if part.strip()]
    if len(parts) < 2:
        return [s]

    if len(parts) == 2:
        left, right = parts
        left_letter = re.match(r"^(.*?)([A-ZÆØÅ])$", left)
        if left_letter and re.fullmatch(r"[A-ZÆØÅ]", right):
            prefix = left_letter.group(1).strip()
            return [
                f"{prefix} {left_letter.group(2)}".strip(),
                f"{prefix} {right}".strip(),
            ]
        if left_letter:
            right_head = re.match(r"^([A-ZÆØÅ])(?:\b|\s+.*)$", right)
            if right_head:
                prefix = left_letter.group(1).strip()
                return [
                    f"{prefix} {left_letter.group(2)}".strip(),
                    f"{prefix} {right_head.group(1)}".strip(),
                ]

        left_words = left.split()
        right_words = right.split()
        if len(left_words) == 1 and left_words[0].lower() in INNTAK_DIRECTION_WORDS and len(right_words) >= 2:
            tail = " ".join(right_words[1:])
            return [f"{left_words[0]} {tail}".strip(), right]
        if len(right_words) == 1 and right_words[0].lower() in INNTAK_DIRECTION_WORDS and len(left_words) >= 2:
            tail = " ".join(left_words[1:])
            return [left, f"{right_words[0]} {tail}".strip()]

        if "," in left:
            comma_parts = [part.strip() for part in re.split(r"\s*,\s*", left) if part.strip()]
            if len(comma_parts) >= 2:
                return comma_parts + [right]

    return parts


def _sanitize_inventory_name(raw: str, plant_name: str | None = None) -> str | None:
    t = _normalize_match_text(raw)
    if not t:
        return None

    t = re.sub(r"^I(?=[A-ZÆØÅ][a-zæøå])", "", t)
    t = re.sub(r"^(?:avl[øo]pet|avlopet)\s*fra\s+", "", t, flags=re.I)
    t = re.sub(r"^(?:bielv\s*til|bi[- ]?elv\s+til)\s*", "", t, flags=re.I)
    t = re.sub(r"^(?:inkl\.?\s*)", "", t, flags=re.I)
    t = re.sub(r"^(?:restfeltene\s+i\s+)", "", t, flags=re.I)
    t = re.sub(r"^(?:forbi\s+inntak(?:et|ene)?\s+i\s+)", "", t, flags=re.I)
    t = re.sub(r"^(?:fra|i)\s+", "", t, flags=re.I)
    t = re.sub(r"\bp[åa]\s+minst\b.*$", "", t, flags=re.I)
    t = re.sub(r"\bp[åa]\s+minimum\b.*$", "", t, flags=re.I)
    t = re.sub(r"\bp[åa]\s+\d.*$", "", t, flags=re.I)
    t = re.sub(r"\b(?:hele|heile)\s+året$", "", t, flags=re.I)
    t = re.sub(r"\bresten\s+av\s+året$", "", t, flags=re.I)
    t = re.sub(r"\bi\s+(?:perioden|tiden)\b.*$", "", t, flags=re.I)
    t = re.sub(r"\s*\([^)]*\)", "", t)
    t = re.sub(r"\s+", " ", t).strip(" ,.;:-\"«»")
    if not t:
        return None

    if len(t) > 80 or len(t) < 2:
        return None
    if len(t) < 3 and not re.search(r"[åøæ]", t, re.I):
        return None
    if re.search(r"[.!?]", t):
        return None
    if re.search(r"\b(?:km2|km²|m3/s|m³/s|l/s|kote|pkt|tiden|perioden|hele året|resten av året|minstevass|minstevann)\b", t, re.I):
        return None
    if re.match(r"^[\d(]", t):
        return None
    if _looks_like_facility_label(t):
        return None
    if re.search(r"\b(?:Oslo Lysverker|NVE|Kongen|departementet|reglementet)\b", t, re.I):
        return None
    if plant_name:
        candidate_lower = _normalize_match_text(t).lower()
        plant_lower = _normalize_match_text(plant_name).lower()
        if candidate_lower == plant_lower and _plant_name_is_facility_label(plant_name):
            return None
        if _plant_name_is_facility_label(plant_name) and (
            plant_lower.startswith(candidate_lower + " ")
            or candidate_lower.startswith(plant_lower + " ")
        ):
            return None
    lowered = t.lower()
    words = re.findall(r"[a-zæøå]+", lowered)
    if not words:
        return None
    if len(words) == 1 and words[0] in INNTAK_STOPWORDS:
        return None
    if any(word in INNTAK_STOPWORDS for word in words) and not re.search(
        r"\b(?:overf[øo]ring|inntak|dam|elv|bekk|vatn|votni|tjern|døla|åna|grovi|grøna|foss)\b",
        lowered,
        re.I,
    ):
        return None
    looks_named = bool(re.search(r"[A-ZÆØÅ]", t))
    has_water_word = bool(
        re.search(
            r"\b(?:overf[øo]ring|inntak(?:et)?|dam(?:men)?|elv(?:a|i)?|bekk(?:en)?|vatn(?:et)?|votni|tjern(?:ene|et)?|døla|åna|grovi|grøna|fossen|selja|seli)\b",
            lowered,
            re.I,
        )
    )
    if not looks_named and not has_water_word and lowered not in GENERIC_INNTAK_NAMES:
        return None
    return t


def _inventory_key(name: str) -> str:
    return _normalize_inntak_navn(name).lower()


# ---------- Contextual name extraction ----------


def _extract_contextual_claim_names(text: str, plant_name: str | None = None) -> list[str]:
    if not text:
        return []
    patterns = [
        re.compile(
            r"\b(?:I|i)\s+([A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-() ]{1,70}?)(?=\s+(?:skal\s+(?:det\s+)?(?:i\s+(?:perioden|tiden)\s+)?slippes|gis\s+en\s+minstevassf\S*|gis\s+en\s+minstevannf\S*|målt|fra|på\s+(?:minst|minimum|\d)|ikke\s+underskride|skal\s+ikke\s+underskride|skal\s+holdes|skal\s+opprettholdes|i\s+perioden|i\s+tiden|hele\s+året|heile\s+året|resten\s+av\s+året))"
        ),
        re.compile(
            r"\b(?:I|i)\s+([A-ZÆØÅ][A-Za-zÆØÅæøå0-9.\-() ]{1,70}?)(?=\s+skal\s+(?:det\s+)?i\s+(?:perioden|tiden)\b)"
        ),
    ]
    out: list[str] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in pattern.finditer(text):
            candidate = match.group(1)
            clean = _sanitize_inventory_name(candidate, plant_name=plant_name)
            if not clean:
                continue
            key = _inventory_key(clean)
            if key in seen:
                continue
            seen.add(key)
            out.append(clean)
    return out


def _extract_names_from_claim_text(text: str, plant_name: str | None = None) -> list[str]:
    if not text:
        return []
    contextual_hits = _extract_contextual_claim_names(text, plant_name=plant_name)
    if contextual_hits:
        return contextual_hits
    out: list[str] = []
    seen: set[str] = set()
    for pattern in STRICT_CLAIM_NAME_PATTERNS:
        for match in pattern.finditer(text):
            groups = [group for group in match.groups() if isinstance(group, str) and group.strip()]
            if not groups:
                continue
            raw_name = groups[0]
            for candidate in _split_group_inntak_names(raw_name):
                clean = _sanitize_inventory_name(candidate, plant_name=plant_name)
                if not clean:
                    continue
                key = _inventory_key(clean)
                if key in seen:
                    continue
                seen.add(key)
                out.append(clean)
    return out


# ---------- Inventory extraction ----------


def extract_inntak_inventory(
    text: str,
    plant_name: str | None = None,
    claims: list[dict] | None = None,
) -> list[dict]:
    inventory: list[dict] = []
    seen: set[str] = set()

    def add_name(raw_name: str) -> None:
        for candidate in _split_group_inntak_names(raw_name):
            clean = _sanitize_inventory_name(candidate, plant_name=plant_name)
            if not clean:
                continue
            key = _inventory_key(clean)
            if not key or key in seen:
                continue
            seen.add(key)
            inventory.append({
                "navn": clean,
                "inntakFunksjon": _guess_inntak_funksjon(clean),
            })

    for claim in claims or []:
        if isinstance(claim, dict):
            claim_text_names = _extract_names_from_claim_text(
                str(claim.get("full_sitat") or ""),
                plant_name=plant_name,
            )
            if claim_text_names:
                for name in claim_text_names:
                    add_name(name)
            else:
                raw_claim_name = str(claim.get("inntak_navn") or "")
                if raw_claim_name and not _looks_like_facility_label(raw_claim_name):
                    add_name(raw_claim_name)

    if not text:
        return inventory

    normalized_text = normalize_ocr_artefacts(text or "")
    for _, sentence in _split_sentences(normalized_text):
        if not re.search(
            r"minstevannf|minstevassf|ikke\s+underskride|skal\s*(?:det\s*)?slippes|gis\s*en\s*minste",
            sentence,
            re.I,
        ):
            continue
        for name in _extract_names_from_claim_text(sentence, plant_name=plant_name):
            add_name(name)

    section: str | None = None
    for raw_line in normalized_text.splitlines():
        line = _normalize_match_text(raw_line)
        if not line:
            continue
        lowered = line.lower()
        if "reguleringsmagasiner" in lowered:
            section = "magasin"
            continue
        if re.search(r"\boverf[øo]ringer\b", lowered):
            section = "overforing"
            continue
        if section and INVENTORY_SECTION_RESET_RE.match(line) and not INVENTORY_SECTION_HEADING_RE.search(line):
            section = None

        if section == "magasin":
            table_match = MAGASIN_TABLE_LINE_RE.match(line)
            if table_match:
                add_name(table_match.group(1))
                continue
            if re.search(r"\b(?:heves|senkes)\b", lowered):
                prefix = re.split(r"\b(?:heves|senkes)\b", line, maxsplit=1, flags=re.I)[0]
                add_name(prefix)
        elif section == "overforing":
            for pattern in OVERFORING_ENTRY_PATTERNS:
                for match in pattern.finditer(line):
                    add_name(match.group(1))

    return inventory
