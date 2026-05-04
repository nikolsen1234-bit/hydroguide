from __future__ import annotations

import hashlib
import json
import logging
import re
import socket
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from src.models import DEFAULT_OLLAMA_TIMEOUT, LLM_CACHE_DIR, CHUNK_THRESHOLD
from src.snippet import _normalize_inntak_navn

logger = logging.getLogger(__name__)


class OllamaError(Exception):
    pass


MINSTEVANN_PROMPT = """Du er en ekstraksjonsmotor for norske vannkraftkonsesjoner. Les dokumentet nedenfor og finn MINSTEVANNFØRING-kravet — altså det minimum-volumet vann konsesjonshaveren er pålagt å slippe forbi hvert inntak.

Returner ETT JSON-objekt:

{
  "funnet": true/false,
  "claims": [
    {
      "inntak_navn": "navn på elven/bekken/magasinet",
      "tall": 100,
      "enhet": "l/s" eller "m3/s",
      "periode_sitat": "periode slik det står i teksten",
      "full_sitat": "hele setningen fra teksten (max 350 tegn)"
    }
  ],
  "tilleggs_krav": "kort oppsummering av tilleggskrav eller null"
}

Viktig:
- Et MINSTEVANNFØRINGSKRAV er et MINIMUMSNIVÅ som ALLTID må slippes forbi inntaket.
- POSITIVE formuleringer som uttrykker et minimumskrav: "skal slippes N", "skal slippes en minstevannføring på N", "skal ikke underskride N", "skal ikke gå under N", "skal holdes/opprettholdes på minst N", "vannføringen ved X skal ikke underskride N", "skal til enhver tid være minst N". ALLE disse er minstevannføringskrav og SKAL ekstraheres.
- Dette er IKKE det samme som maksimumsgrenser eller tak: "inntil N m3/s" (uten "minst"-kontekst), "maksimalt", "spyleflom", "tappeflom", "kan variere mellom", "ikke overskride" (motsatt av underskride!), "slukeevne", "overføringskapasitet", reguleringsgrenser (HRV/LRV/kote), magasineringsterskler.
- Hvis dokumentet har både søkers forslag og NVEs/OEDs endelige vedtak, bruk KUN det endelige vedtaket. I Kgl.res.-dokumenter finnes vedtaket vanligvis mot slutten, markert med "Departementet fastsetter", "Kongen i statsråd fastsetter", eller i selve manøvreringsreglementet. Ignorer tall fra NVEs anbefaling, søkers forslag, Fylkesmannens uttalelse, eller høringsinstanser — disse er IKKE bindende.
- Hvis et inntak har ulike verdier for sommer og vinter, lag én claim per periode. VIKTIG: Les HELE setningen for å fange BEGGE perioder. Mønsteret "N1 l/s i perioden X og N2 l/s resten av året" betyr alltid TO claims — én for perioden X og én for resten av året. Ignorer ALDRI den andre halvdelen av en slik setning. Gamle norske konsesjoner har ofte mønsteret "N1 m3/s i perioden 1. november-30. april og N2 m3/s i perioden 30. april-1. november" — dette er TO claims, ikke ett.
- Hvis dokumentet har 3 eller 4 ulike perioder for samme inntak (f.eks. mai, juni-august, august-september, oktober-april), lag én claim for HVER periode. Ikke slå sammen perioder.
- Hvis flere inntak har hver sine krav, lag én claim per inntak per periode. IKKE bland tall fra forskjellige inntak.
- Bruk punktum som desimaltegn (0.15, ikke 0,15).
- Hvis dokumentet IKKE har et eksplisitt minimumskrav, returner funnet: false.
- VIKTIG: Hvis dokumentet sier at minstevannføring IKKE pålegges ("NVE anbefaler ikke minstevannføring", "det ble besluttet at minstevannføring ikke pålegges", "NVE frarår pålegg om minstevannføring"), returner funnet: false — selv om dokumentet diskuterer og nevner tall i vurderingen. Kun BINDENDE VEDTAK teller.
- Dokumenter med titler som "konsesjon til videre drift", "brev om vilkår", "tillatelse" kan inneholde minstevannføringskrav i vilkårene — les hele dokumentet, ikke bare overskriften.
- inntak_navn MÅ være skrevet ordrett slik det forekommer i teksten (elv, bekk, magasin, stedsnavn). Ikke oppfinn navn.
- periode_sitat MÅ være ordrett kopi fra teksten.
- full_sitat MÅ inneholde både tallet og inntakets navn (eller tydelig binding mellom dem).

EKSEMPEL PÅ HVA SOM IKKE ER MINSTEVANNFØRING:

Tekst: "Det kan pålegges inntil 2 spyleflommer årlig, hver på maksimalt 5 m3/s og med maksimalt 10 døgns varighet."
→ Dette er spyleflom (en maksimumsgrense), IKKE minstevannføring. Skal IKKE bli en claim.

Tekst: "Slukeevnen i kraftverket skal ikke overskride 12 m3/s."
→ Dette er slukeevne, IKKE minstevannføring. Skal IKKE bli en claim.

Tekst: "NVE kan pålegge en vannslipping til Børselva som over året kan variere mellom 0,1 og 2 m3/s."
→ "Kan variere mellom" er IKKE et minimumskrav. Skal IKKE bli en claim.

EKSEMPEL PÅ KORREKT HÅNDTERING AV MULTI-INNTAK:

Tekst: "Forbi inntaket i Synna skal det i perioden 1. mai til 30. september slippes hele den naturlige vannføring, inntil 100 liter/sekund. Fra dammen ved Veslefossen (Grønvoll) skal det slippes 0,4 m3/s i perioden 1. oktober – 30. april og 1 m3/s i perioden 1. mai – 30. september. Fra Kjøljuamagasinet skal det slippes en minstevannføring på 1,5 m3/sek. i perioden 1. november – 30. april og 3 m3/sek. i perioden 30. april – 1. november."

→ Korrekt svar:
{
  "funnet": true,
  "claims": [
    {"inntak_navn": "Synna", "tall": 100, "enhet": "l/s", "periode_sitat": "1. mai til 30. september", "full_sitat": "Forbi inntaket i Synna skal det i perioden 1. mai til 30. september slippes hele den naturlige vannføring, inntil 100 liter/sekund."},
    {"inntak_navn": "Grønvoll", "tall": 0.4, "enhet": "m3/s", "periode_sitat": "1. oktober – 30. april", "full_sitat": "Fra dammen ved Veslefossen (Grønvoll) skal det slippes 0,4 m3/s i perioden 1. oktober – 30. april"},
    {"inntak_navn": "Grønvoll", "tall": 1, "enhet": "m3/s", "periode_sitat": "1. mai – 30. september", "full_sitat": "og 1 m3/s i perioden 1. mai – 30. september"},
    {"inntak_navn": "Kjøljuamagasinet", "tall": 1.5, "enhet": "m3/s", "periode_sitat": "1. november – 30. april", "full_sitat": "Fra Kjøljuamagasinet skal det slippes en minstevannføring på 1,5 m3/sek. i perioden 1. november – 30. april"},
    {"inntak_navn": "Kjøljuamagasinet", "tall": 3, "enhet": "m3/s", "periode_sitat": "30. april – 1. november", "full_sitat": "og 3 m3/sek. i perioden 30. april – 1. november"}
  ],
  "tilleggs_krav": null
}

Legg merke til: hvert tall er knyttet til riktig inntak ved at full_sitat nevner inntaket eller står i samme setning som inntaket. Også: Kjøljuamagasinet har BÅDE et sommer- OG et vinterkrav i samme setning — begge skal med.

EKSEMPEL PÅ "IKKE UNDERSKRIDE" (gammel konsesjons-formulering som ER minstevannføring):

Tekst: "I perioden 15. september til 20. oktober skal vannføringen ved Kolbjørnshus ikke underskride 10 m3/sek."
→ Korrekt claim: {"inntak_navn": "Kolbjørnshus", "tall": 10, "enhet": "m3/s", "periode_sitat": "15. september til 20. oktober", "full_sitat": "I perioden 15. september til 20. oktober skal vannføringen ved Kolbjørnshus ikke underskride 10 m3/sek."}

"Ikke underskride N" betyr "minimum N" — dette ER et minstevannføringskrav.

Analyser denne teksten for kraftverket "__NAVN__":
---
__SNIPPET__
---

Returner kun JSON-objektet, ingen forklaring."""


def llm_cache_path(nve_id: int, model: str, snippet: str) -> Path:
    key = hashlib.sha256(f"{nve_id}|{model}|{snippet}".encode("utf-8")).hexdigest()[:16]
    model_safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", model)
    return LLM_CACHE_DIR / f"nve_{nve_id}_{model_safe}_{key}.json"


def call_ollama(prompt: str, model: str, host: str, timeout: int = DEFAULT_OLLAMA_TIMEOUT) -> dict:
    num_ctx = 8192
    print(f"    [ollama] prompt~={len(prompt)//3}tok  num_ctx={num_ctx}", flush=True)

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.1,
            "top_p": 0.95,
            "top_k": 64,
            "num_ctx": num_ctx,
            "num_predict": 2000,
        },
    }
    url = f"{host.rstrip('/')}/api/generate"
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError(f"Refusing non-http(s) URL: {url}")
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="replace")
        return json.loads(body)
    except HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode("utf-8", errors="replace")[:300]
        except Exception as read_exc:
            logger.debug("Could not read HTTPError body: %s", read_exc)
        raise OllamaError(f"HTTP {e.code} from Ollama: {detail or e.reason}") from e
    except URLError as e:
        raise OllamaError(f"Cannot reach Ollama at {host}: {e.reason}") from e
    except socket.timeout as e:
        raise OllamaError(f"Ollama timeout after {timeout}s") from e
    except json.JSONDecodeError as e:
        raise OllamaError(f"Ollama returned non-JSON envelope: {e}") from e


def _parse_llm_response(raw: dict) -> dict | None:
    response_text = raw.get("response", "") if isinstance(raw, dict) else ""
    response_text = re.sub(r"<think>.*?</think>\s*", "", response_text, flags=re.S | re.I)
    m = re.search(r"[\{\[]", response_text)
    if m:
        response_text = response_text[m.start():]
    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or "funnet" not in parsed:
        return None
    return parsed


def _call_and_cache(nve_id: int, navn: str, snippet: str, model: str,
                    host: str, use_cache: bool) -> dict | None:
    cache_path = llm_cache_path(nve_id, model, snippet)
    if use_cache and cache_path.exists():
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
    else:
        prompt = MINSTEVANN_PROMPT.replace("__NAVN__", navn).replace("__SNIPPET__", snippet)
        raw = call_ollama(prompt, model=model, host=host)
        cache_path.write_text(
            json.dumps(raw, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return _parse_llm_response(raw)


def _split_snippet_into_chunks(snippet: str) -> list[str]:
    paragraphs = snippet.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for para in paragraphs:
        if current_len + len(para) > CHUNK_THRESHOLD and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def extract_with_llm(
    nve_id: int,
    navn: str,
    snippet: str,
    model: str,
    host: str,
    use_cache: bool = True,
) -> dict:
    if len(snippet) <= CHUNK_THRESHOLD:
        result = _call_and_cache(nve_id, navn, snippet, model, host, use_cache)
        if result is None:
            return {
                "funnet": False,
                "grunn": "llm parse error",
                "_raw": snippet[:500],
            }
        return result

    VEDTAK_CHUNK_RE = re.compile(
        r"vilk[åa]r|vedtak|man[øo]vreringsreglement|fastsett|p[åa]legg"
        r"|skal\s+slippes.*m3/s|minstevannf[øo]ring.*m3/s",
        re.I,
    )
    FORSLAG_CHUNK_RE = re.compile(
        r"forslag|anbefal|h[øo]ringsuttalelse|mener\s+at|mener\s+det"
        r"|foresl[åa]r|foresl[åa]tt|b[øo]r\s+vurdere",
        re.I,
    )

    chunks = _split_snippet_into_chunks(snippet)
    print(f"    [chunked] {len(chunks)} chunks ({len(snippet)} chars)", flush=True)

    chunk_results: list[tuple[int, list[dict], str | None]] = []
    for chunk in chunks:
        parsed = _call_and_cache(nve_id, navn, chunk, model, host, use_cache)
        if parsed is None:
            continue
        claims = parsed.get("claims") or []
        if not claims:
            continue
        vedtak_hits = len(VEDTAK_CHUNK_RE.findall(chunk))
        forslag_hits = len(FORSLAG_CHUNK_RE.findall(chunk))
        if vedtak_hits > forslag_hits:
            priority = 2
        elif forslag_hits > vedtak_hits:
            priority = 0
        else:
            priority = 1
        chunk_results.append((priority, claims, parsed.get("tilleggs_krav")))

    if not chunk_results:
        return {"funnet": False, "grunn": "ingen krav funnet i noen chunk"}

    chunk_results.sort(key=lambda x: -x[0])

    all_claims: list[dict] = []
    tilleggs: list[str] = []
    seen: set[tuple] = set()
    for priority, claims, tk in chunk_results:
        for c in claims:
            try:
                tall = float(c.get("tall") or 0)
            except (TypeError, ValueError):
                tall = 0
            period_key = (c.get("periode_sitat") or "").strip().lower()
            period_key = re.sub(r"\s*([./-])\s*", r"\1", period_key)
            period_key = re.sub(r"\s+", " ", period_key)
            key = (_normalize_inntak_navn(c.get("inntak_navn") or "").lower(), tall, period_key)
            if key not in seen:
                seen.add(key)
                all_claims.append(c)
        if tk:
            tilleggs.append(tk)

    return {
        "funnet": True,
        "claims": all_claims,
        "tilleggs_krav": " ".join(tilleggs) if tilleggs else None,
    }
