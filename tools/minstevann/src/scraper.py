from __future__ import annotations

import json
import logging
import re
from html import unescape
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from src.models import (
    UA,
    CACHE_DIR,
    NVE_BASE,
    NVE_ARCGIS_QUERY,
    WORKSPACE_ROOT,
)

logger = logging.getLogger(__name__)

# ---------- HTTP helpers ----------


def http_get(url: str, as_bytes: bool = False) -> bytes | str:
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError(f"Refusing non-http(s) URL: {url}")
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=60) as r:
        data = r.read()
    return data if as_bytes else data.decode("utf-8", errors="replace")


def cached_get(url: str, cache_name: str, as_bytes: bool = False):
    path = CACHE_DIR / cache_name
    if path.exists():
        return path.read_bytes() if as_bytes else path.read_text(encoding="utf-8", errors="replace")
    data = http_get(url, as_bytes=True)
    path.write_bytes(data)
    return data if as_bytes else data.decode("utf-8", errors="replace")


# ---------- Case ID resolution ----------


def load_case_id_lookup() -> dict[int, list[int]]:
    lookup: dict[int, list[int]] = {}

    for path in sorted(WORKSPACE_ROOT.glob("*_saker.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.debug("Skipping unreadable saker file %s: %s", path, exc)
            continue
        if not isinstance(payload, dict):
            continue

        for raw_kdb, entry in payload.items():
            if not isinstance(entry, dict):
                continue
            try:
                kdb_nr = int(raw_kdb)
            except (TypeError, ValueError):
                continue

            merged = lookup.setdefault(kdb_nr, [])
            for raw_case_id in entry.get("sak_ids", []) or []:
                try:
                    case_id = int(raw_case_id)
                except (TypeError, ValueError):
                    continue
                if case_id not in merged:
                    merged.append(case_id)

    return lookup


def resolve_case_ids(kdb_nr: int, case_id_lookup: dict[int, list[int]] | None = None) -> list[int]:
    lookup = case_id_lookup or {}
    resolved: list[int] = []

    for candidate in lookup.get(kdb_nr, []):
        if candidate not in resolved:
            resolved.append(candidate)

    if kdb_nr not in resolved:
        resolved.append(kdb_nr)

    return resolved


# ---------- HTML parsing ----------

ATTACH_RE = re.compile(
    r'<a[^>]*href="([^"]*PublishedFiles/Download/[^"]+)"[^>]*>(.*?)</a>',
    re.S | re.I,
)

KDB_PDF_RE = re.compile(
    r'<a[^>]*href="(/kdb/sc\d+\.pdf)"[^>]*>(.*?)</a>',
    re.S | re.I,
)


def parse_konsesjon_html(html: str) -> dict:
    attachments = []

    for m in KDB_PDF_RE.finditer(html):
        url = NVE_BASE + unescape(m.group(1))
        title = unescape(re.sub(r"<[^>]+>", " ", m.group(2)))
        title = re.sub(r"\s+", " ", title).strip() or "Gjeldende konsesjon"
        attachments.append({"title": f"[KDB] {title}", "url": url, "primary": True})

    for m in ATTACH_RE.finditer(html):
        url = unescape(m.group(1))
        title = unescape(re.sub(r"<[^>]+>", " ", m.group(2)))
        title = re.sub(r"\s+", " ", title).strip()
        attachments.append({"title": title, "url": url, "primary": False})

    fritekst = None
    body = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.S | re.I)
    text = unescape(re.sub(r"<[^>]+>", " ", body))
    text = re.sub(r"\s+", " ", text)
    m = re.search(r"([^.]{0,200}minstevannf[^.]{0,400}\.)", text, re.I)
    if m:
        fritekst = m.group(1).strip()

    return {"fritekst": fritekst, "attachments": attachments}


def rank_attachment(title: str, plant_name: str | None = None) -> int:
    t = re.sub(r"[_]+", " ", title.lower())
    score = 0
    if t.startswith("[kdb]"):
        return 1000
    if re.search(r"\bgjeldende\s+konsesjon\b", t):
        score += 160
    if re.search(r"\bkonsesjonsvilk[Ã¥a]r\b", t):
        score += 150
    if re.search(r"\bvassdragskonsesjon\b", t):
        score += 100
    if re.search(r"\bkonsesjon\s+med\s+vilk[Ã¥a]r\b", t):
        score += 100
    if re.search(r"\btillatelse\s+til\s+(regulering|[Ã¸o]kt)", t):
        score += 90
    if re.search(r"\bkgl\.?\s*res", t):
        score += 80
    if "omgjÃ¸ring" in t and ("konsesjon" in t or "vilkÃ¥r" in t):
        score += 90
    if re.search(r"\bkonsesjon(en)?\b", t) and "sÃ¸knad" not in t and "sÃ¸k" not in t:
        score += 40
    if re.search(r"forslag\s+til\s+vilk[Ã¥a]r|nytt\s+sett\s+vilk[Ã¥a]r", t):
        score += 60
    if re.search(r"oversendelse\s+til\s+oed|oversendelse\s+til\s+departement", t):
        score += 35
    if re.search(r"oversendelse.*vedtak", t):
        score += 15
    if "anleggskonsesjon" in t:
        score += 10
    if re.search(r"man[Ã¸o]vreringsreglement", t):
        score += 70
    if re.search(r"\bvedtatt\b", t) and not re.search(r"vilk[Ã¥a]r|reglement", t):
        score -= 50
    if re.search(r"dep\s+bemerkning|departementets?\s+bemerkning", t):
        score -= 60
    if re.search(r"konsesjon\s+til\s+videre\s+drift|tillatelse\s+til\s+videre\s+drift", t):
        score += 50
    if re.search(r"konsesjonssÃ¸knad|sÃ¸knad\s+om\s+konsesjon", t):
        score += 15
    if re.search(r"hÃ¸ringsuttalelse|frÃ¥segn|kunngjÃ¸r|orientering", t):
        score -= 40
    if re.search(r"detaljplan|miljÃ¸\s*-?\s*og\s+landskap|deponi|vegetasjon", t):
        score -= 40
    if re.search(r"bakgrunn\s+for\s+vedtak|nves?\s+vurdering|nves?\s+innstilling", t):
        score -= 60
    if re.search(r"^vedlegg\s+\d", t):
        score -= 30
    if re.search(r"kommentar(er)?\s+fra|klage\s+fra|innsigelse", t):
        score -= 20
    if plant_name and len(plant_name.strip()) > 3:
        pn = plant_name.lower().strip()
        if pn in t:
            score += 20
        elif re.search(r"kraftverk|kraftstasjon", t):
            score -= 15
    return score


def score_attachment_text(text: str) -> int:
    t = text.lower()
    score = 0
    if "minstevannf" in t:
        score += 70
    if re.search(r"skal\s+slippes[^.\n]{0,140}(?:minstevannf|\d+\s*(?:l/s|1/s|m3/s))", t):
        score += 110
    if re.search(r"fra\s+inntaket", t):
        score += 60
    if re.search(r"\bi\s+perioden\b", t):
        score += 20
    if re.search(r"man[Ã¸o]vreringsreglement", t):
        score += 25
    if re.search(r"nve\s+anbefaler|departementet\s+tilrÃ¥r|hÃ¸ringsinstans", t):
        score -= 80
    if re.search(r"sÃ¸kers kommentarer|oppsummering av sÃ¸knaden|planendringene vil", t):
        score -= 50
    return score


def score_case_candidate(candidate: dict, kdb_nr: int, plant_name: str | None = None) -> int:
    attachments = candidate.get("attachments") or []
    if not attachments and not candidate.get("fritekst"):
        return -10_000

    score = max((rank_attachment(att["title"], plant_name=plant_name) for att in attachments), default=0)
    exact_kdb = any(re.search(rf"/sc{kdb_nr}\.pdf$", att.get("url", ""), re.I) for att in attachments)
    wrong_kdb = any(
        att.get("primary") and not re.search(rf"/sc{kdb_nr}\.pdf$", att.get("url", ""), re.I)
        for att in attachments
    )
    if exact_kdb:
        score += 250
    elif wrong_kdb:
        score -= 120
    if candidate.get("fritekst"):
        score += 10
    return score


# ---------- NVE ArcGIS queries ----------


def fetch_plants_from_nve_ids(nve_ids: list[int]) -> dict[int, dict]:
    if not nve_ids:
        return {}

    resolved: dict[int, dict] = {}

    def _query(where: str) -> list[dict]:
        params = {
            "where": where,
            "outFields": "kdbNr,vannkraftverkNr,vannkraftStasjonNavn",
            "returnGeometry": "false",
            "f": "json",
            "resultRecordCount": "500",
        }
        url = NVE_ARCGIS_QUERY + "?" + urlencode(params)
        if urlparse(url).scheme not in ("http", "https"):
            raise ValueError(f"Refusing non-http(s) URL: {url}")
        with urlopen(Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            data = json.loads(r.read().decode("utf-8", errors="replace"))
        return data.get("features", []) or []

    remaining = []
    for value in nve_ids:
        try:
            remaining.append(int(value))
        except (TypeError, ValueError):
            continue

    if remaining:
        where = "vannkraftverkNr IN (" + ",".join(str(v) for v in remaining) + ")"
        try:
            for feature in _query(where):
                attrs = feature.get("attributes", {})
                nve_id = attrs.get("vannkraftverkNr")
                kdb_nr = attrs.get("kdbNr")
                navn = attrs.get("vannkraftStasjonNavn")
                if nve_id is None or kdb_nr is None:
                    continue
                resolved[int(nve_id)] = {
                    "nveId": int(nve_id),
                    "kdbNr": int(kdb_nr),
                    "navn": str(navn) if navn else f"kraftverk_{nve_id}",
                }
        except Exception as e:
            print(f"Advarsel: NVE oppslag pÃ¥ vannkraftverkNr feilet: {e}")

    return resolved


def fetch_all_plants() -> list[dict]:
    plants: list[dict] = []
    seen: set[int] = set()
    offset = 0
    page_size = 1000

    while True:
        params = {
            "where": "vannkraftverkNr IS NOT NULL AND kdbNr IS NOT NULL AND vannkraftStasjonNavn IS NOT NULL",
            "outFields": "kdbNr,vannkraftverkNr,vannkraftStasjonNavn",
            "returnGeometry": "false",
            "f": "json",
            "resultOffset": str(offset),
            "resultRecordCount": str(page_size),
            "orderByFields": "vannkraftverkNr ASC",
        }
        url = NVE_ARCGIS_QUERY + "?" + urlencode(params)
        if urlparse(url).scheme not in ("http", "https"):
            raise ValueError(f"Refusing non-http(s) URL: {url}")
        with urlopen(Request(url, headers={"User-Agent": UA}), timeout=60) as response:
            data = json.loads(response.read().decode("utf-8", errors="replace"))

        features = data.get("features", []) or []
        if not features:
            break

        for feature in features:
            attrs = feature.get("attributes", {})
            kdb = attrs.get("kdbNr")
            navn = attrs.get("vannkraftStasjonNavn")
            nve_id = attrs.get("vannkraftverkNr")
            if nve_id is None or kdb is None or not navn:
                continue
            nve_id = int(nve_id)
            kdb = int(kdb)
            if nve_id in seen:
                continue
            seen.add(nve_id)
            plants.append({
                "nveId": nve_id,
                "kdbNr": kdb,
                "navn": str(navn).strip(),
            })

        if len(features) < page_size:
            break
        offset += page_size

    return plants
