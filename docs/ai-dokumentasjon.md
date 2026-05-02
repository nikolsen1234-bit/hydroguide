# AI-dokumentasjon

Oppdatert: 2026-04-29

Alt KI-relatert i HydroGuide — rapportgenerering (Cloudflare), minstevannføring-ekstraksjon (lokal), retrieval-arkitektur og OCR.

---

## 1. Rapportgenerering (Cloudflare AI Worker)

### Flyt

```
  Frontend                              Pages Functions          AI Worker (hydroguide-w-r2)
     │                                       │                           │
     │  POST /api/polish-report              │                           │
     │  { tilgangskodeHash, prosjekt, ... }  │                           │
     ▼                                       │                           │
     ─────────────────────────────────────►  │                           │
                                             │                           │
                                    ┌────────┴──────────┐                │
                                    │ polish-report.js  │                │
                                    │ • rate limit      │                │
                                    │ • valider kode    │                │
                                    │ • service-binding ├───────────────►│ 
                                    └───────────────────┘                │
                                                              ┌──────────┴─────────────┐
                                                              │ 1. Bygg query          │
                                                              │ 2. Hent evidens:       │
                                                              │    AutoRAG / KV / Vec. │
                                                              │ 3. Bygg prompt         │
                                                              │ 4. OpenAI via Gateway  │
                                                              │    (cache + retry)     │
                                                              │ 5. Self-feedback       │
                                                              │ 6. Return { text }     │
                                                              └───────┬────────────────┘
     ◄────────────────────────────────────────────────────────────────┘
```

### Retrieval

AI Worker henter NVE-evidens fra tre kilder:

| Kilde | Hva | Når |
|-------|-----|-----|
| KV (PROMPT_KV) | Bucketert evidens: krav, metode, valgkrit, risiko, drift | Alltid (grunnmur) |
| AI Search / AutoRAG | Semantisk søk mot NVE-korpus | Når `AI_SEARCH_*` er konfigurert |
| Vectorize | Vektorbasert søk | Alternativ/supplement |

Strategi styres av `RETRIEVAL_STRATEGY`: `hybrid` (default), `kv-only`, `vectorize-only`, `autorag-only`.

### Generering

- Primærmodell: `gpt-5.1` via Cloudflare AI Gateway
- Fallback: `gpt-5.4-mini`
- Max 90 ord / 4 setninger / 350 output tokens
- Self-feedback: modellen vurderer eget svar og kan regenerere (`SELF_FEEDBACK_ENABLED`)
- AI Gateway gir caching (TTL 3600s), retry (3 forsøk), timeout (8s)

### NVE-korpus

Korpuset er NVE-veiledere og forskrifter oppdelt i chunks, lagret i R2 (`hydroguide-r2`) med pre-genererte embeddings. Bygges med:

```bash
node backend/scripts/build-ai-search-corpus.mjs   # generer chunks
node backend/scripts/upload-corpus-to-r2.ps1       # last opp til R2
node backend/scripts/seed-kv.ps1                   # seed KV-buckets
```

---

## 2. Minstevannføring-pipeline (lokal)

### Hva den gjør

Leser konsesjonsdokumenter fra NVE og henter ut strukturerte minstevannføringskrav for ~1500 norske vannkraftverk. Output er `backend/data/minimumflow.json` som lastes opp til R2 og serveres via `/api/nveid/{nveID}/minimum-flow`.

### Pipeline-flyt

Kjører i cycles à 25 stasjoner:

```
NVE ArcGIS → finn stasjon (nveId, kdbNr, navn)
→ last ned konsesjonssak HTML + PDF-vedlegg
→ OpenDataLoader convert() med alle PDFer i én JVM-kall (JSON-format)
→ klassifiser: digital+relevant (good), digital uten (bad), skannet (scanned)
→ scannede → hybrid OCR (auto triage, full retry ved <100 tegn)
→ normaliser OCR-artefakter (vassføring, l/s, m3/s)
→ Ollama leser filtrert tekst → strukturerte claims
→ assembler claims til inntak med perioder og verdier
→ skriv til run_XXX.json fortløpende
```

### Klassifisering

Etter JSON-preparse sjekkes hvert dokument:

| Klassifisering | Betingelse | Handling |
|----------------|------------|----------|
| `good` | Digital PDF, relevante nøkkelord funnet | Filtrert tekst rett til Ollama |
| `bad` | Digital PDF, ingen relevante nøkkelord | Logges, kan kjøres med hybrid senere |
| `scanned` | Kun bilde-elementer, ingen tekst | Hybrid OCR automatisk |

### OCR for skannede PDFer

Skannede PDFer (gamle konsesjoner fra 1930–1980-tallet, skannet som bilder) kjøres gjennom OpenDataLoader hybrid mode:

1. **Auto triage** — Docling bestemmer hvilke sider som trenger OCR (EasyOCR)
2. Hvis resultatet er <100 tegn → **full retry** (alle sider tvinges gjennom OCR)
3. Hybrid-serveren startes automatisk av pipelinen (`opendataloader-pdf-hybrid --port 5002 --force-ocr --ocr-lang no,en`)

### Ollama-modell og prompt

- Modell: `gemma4:e4b-it-q4_K_M` (lokal, kjører på GPU)
- Prompten instruerer modellen til å:
  - Skille minstevannføringskrav fra andre tall (slukeevne, spyleflom, reguleringsgrenser)
  - Bruke endelig vedtak, ikke forslag eller høringsuttalelser
  - Håndtere flere inntak og perioder i samme dokument
  - Returnere strukturert JSON med claims

### Snippet-filtrering

For digitale PDFer filtrerer JSON-preparseren på element-nivå: bare headings, paragrafer, tabeller og lister som matcher relevans-nøkkelord (minstevannføring, vannslipp, pålegges, osv.) beholdes, med ±2 element kontekstvindu. Reduserer snippet-størrelsen med 56–92%.

For hybrid-OCR-resultater kjøres `find_relevant_window()` (snippet.py) med setnings-basert vindu og boilerplate-fjerning.

### CLI

```bash
python run.py plant 1696       # én stasjon
python run.py batch --n 500    # 500 stasjoner i cycles à 25
python run.py batch --resume   # fortsett der den stoppet
python run.py preparse         # preparse cached PDFer
python run.py export           # skriv til minimumflow.json
```

### Output-format

`minimumflow.json` — keyed by NVEID:

```json
{
  "1696": {
    "navn": "Hynna",
    "funnet": true,
    "inntak": [
      {
        "inntakFunksjon": "inntak",
        "sommer_ls": 150,
        "sommer_periode": "01.05 - 30.09",
        "vinter_ls": 50,
        "vinter_periode": "01.10 - 30.04"
      }
    ]
  }
}
```

---

## 3. PDF-generatorer

To lokale Python-skript genererer PDF-rapporter fra beregningsresultater:

| Skript | Output |
|--------|--------|
| `tools/horizon_pdf.py` | Horisontprofil-rapport med SVG-diagram |
| `tools/solar_position_pdf.py` | Solposisjon-rapport med årsdiagram |

Disse kjøres lokalt og er ikke del av deploy-pakken. Outputen er PDF-filer som brukeren laster ned.
