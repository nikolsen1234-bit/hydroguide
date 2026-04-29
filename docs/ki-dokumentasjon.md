# HydroGuide KI-dokumentasjon

Oppdatert: 2026-04-29

## Oversikt

HydroGuide bruker KI på to måter:

1. **Rapportgenerering** — Cloudflare AI Worker polerer tekniske rapporter med NVE-kildedata
2. **Minstevannføring-ekstraksjon** — lokal Ollama-pipeline leser konsesjonsdokumenter og henter ut strukturerte krav

---

## Rapportgenerering (Cloudflare)

### Arkitektur

```
Frontend → POST /api/polish-report → AI Worker → OpenAI (via AI Gateway) → svar
```

### Flyt

1. Frontend bygger payload fra brukerens svar og beregningsresultater
2. Brukeren skriver inn eksportkode
3. `polish-report.js` validerer kode og rate-limiter (20 kall/min per IP)
4. Requesten går videre til `AI_WORKER` via service binding
5. AI Worker henter evidens, bygger prompt, kaller modell, returnerer tekst

### Retrieval (evidensinnhenting)

AI Worker bruker tre kilder for NVE-referanser:

| Kilde | Beskrivelse | Rolle |
|-------|-------------|-------|
| KV | Bucketert evidens fra NVE-korpus (krav, metode, valgkrit, risiko, drift) | Grunnmur |
| AI Search (AutoRAG) | Semantisk søk | Forsterkning |
| Vectorize | Vektorbasert søk | Alternativ/supplement |

Strategi styres av `RETRIEVAL_STRATEGY`: `hybrid` (default), `kv-only`, `vectorize-only`, `autorag-only`, `auto`.

### Modeller og generering

- Primærmodell: `gpt-5.1` via Cloudflare AI Gateway
- Fallback: `gpt-5.4-mini`
- Max 90 ord / 4 setninger / 350 output tokens
- Self-feedback: modellen vurderer eget svar og regenererer ved behov (`SELF_FEEDBACK_ENABLED`)
- Gateway: caching (TTL 3600s), retry (3 forsøk, eksponentiell backoff), timeout (8s)

### Bindings

| Binding | Funksjon |
|---------|----------|
| `AI_WORKER` | Service binding til AI Worker |
| `PROMPT_KV` | KV namespace med NVE-korpus |
| `R2_BUCKET` | Korpuslagring |
| `VECTORIZE_INDEX` | Vektorindeks for semantisk søk |
| `AI` | Cloudflare AI namespace (AutoRAG) |
| `AI_GATEWAY_*` | Gateway-konfigurasjon (account, ID, auth token) |
| `AI_SEARCH_*` | AutoRAG-konfigurasjon (instance, threshold, reranking) |

---

## Minstevannføring-pipeline (lokal)

### Arkitektur

```
NVE ArcGIS → last ned PDF → OpenDataLoader JSON → filtrer → Ollama → strukturert JSON
```

### Pipeline-flyt

Pipelinen kjører i cycles à 25 stasjoner:

1. **Download** — hent konsesjonssaker og PDF-vedlegg fra NVE
2. **Preparse** — alle PDFer i én OpenDataLoader `convert()`-kall (JSON-format)
3. **Klassifiser** — digital med relevance → `good`, digital uten → `bad`, bare bilder → `scanned`
4. **OCR** — scannede PDFer → hybrid OCR (auto triage, full retry ved <100 tegn)
5. **Normaliser** — OCR-artefakter fikses (`vassføring`, `l/s`, `m3/s` osv.) én gang, rett før LLM
6. **Ollama** — Gemma 4 leser filtrert tekst og returnerer strukturerte claims
7. **Assembler** — claims → NVEID-format med inntak, perioder og verdier

### Modell og prompt

- Modell: `gemma4:e4b-it-q4_K_M` via lokal Ollama
- Prompten skiller minstevannføringskrav fra andre vassdrags­tall (slukeevne, spyleflom, reguleringsgrenser)
- Chunking for store dokumenter (>8000 tegn) med prioritering av vedtaks-chunks over forslags-chunks

### Output

Resultater skrives fortløpende til `run_XXX.json` og kan eksporteres:

```bash
python tools/minstevann/run.py export
```

Skriver til `backend/data/minimumflow.json`, keyed by NVEID:

```json
{
  "1696": {
    "navn": "Hynna",
    "funnet": true,
    "inntak": [{"sommer_ls": 150, "sommer_periode": "01.05 - 30.09", ...}]
  }
}
```

Frontend leser dette via `GET /api/nveid/{NVEID}/minimum-flow`.

### CLI

```bash
python tools/minstevann/run.py plant 1696       # én stasjon
python tools/minstevann/run.py batch --n 500    # 500 stasjoner i cycles à 25
python tools/minstevann/run.py batch --resume   # fortsett der den stoppet
python tools/minstevann/run.py preparse         # preparse cached PDFer manuelt
python tools/minstevann/run.py export           # eksporter til minimumflow.json
```
