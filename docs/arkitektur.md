# HydroGuide — Arkitekturoversikt

Oppdatert: 2026-04-29

## Hva er HydroGuide

HydroGuide er et verktøy for planlegging av vannkraft- og solenergianlegg i Norge. Systemet har tre hoveddeler:

1. En **nettside** der brukere konfigurerer anlegg, kjører beregninger og genererer rapporter
2. Et **API** som serverer beregninger, minstevannføring-data og tredjeparts-proxyer
3. En **lokal pipeline** som leser NVE-konsesjonsdokumenter og bygger en database over minstevannføringskrav

## Systemdiagram

```
       ┌─────────────────────────────────────────────────────────┐
       │  Brukerens nettleser                                    │
       │  hydroguide.no (React SPA)                              │
       └────────────────┬────────────────────────────────────────┘
                        │
       ┌────────────────▼────────────────────────────────────────┐
       │  Cloudflare Edge                                        │
       │                                                         │
       │  ┌────────────────────┐   ┌──────────────────────────┐  │
       │  │ hydroguide-api     │   │ Pages Functions          │  │
       │  │ (Worker)           │   │                          │  │
       │  │                    │   │ /api/polish-report ──────┼──┼──┐
       │  │ /api/nveid         │   │                          │  │  │
       │  │ /api/calculations  │   └──────────────────────────┘  │  │
       │  │ /api/pvgis-tmy     │                                 │  │
       │  │ /api/docs          │   ┌──────────────────────────┐  │  │
       │  │ /api/health        │   │ hydroguide-w-r2          │◄─┼──┘
       │  │ ...                │   │ (AI Worker)              │  │
       │  └────────┬───────────┘   │  • RAG mot NVE-korpus    │  │
       │           │               │  • OpenAI / Workers AI   │  │
       │           │               └────────────┬─────────────┘  │
       │           │                            │                │
       │           ▼                            ▼                │
       │  ┌──────────────────────────────────────────────────┐   │
       │  │ Lagring                                          │   │
       │  │ KV (API_KEYS, PROMPT_KV)                         │   │
       │  │ R2 (api-data, korpus, assets)                    │   │
       │  │ AI Gateway (caching / retry mot OpenAI)          │   │
       │  └──────────────────────────────────────────────────┘   │
       └─────────────────────────────────────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │  Lokalt (utviklermaskin)                                │
       │                                                         │
       │  Minstevannføring-pipeline                              │
       │  NVE → PDF → OpenDataLoader → Ollama → JSON             │
       │                                                         │
       │  Output: backend/data/minimumflow.json                  │
       │  Lastes opp til R2 → serveres via /api/nveid            │
       └─────────────────────────────────────────────────────────┘
```

## KI-pipeline

To KI-flyter: én lokal som bygger datagrunnlaget, én i sky som genererer rapporten.

### 1. Minstevannføring-pipeline (lokal, batch)

```
  ┌───────────────────────────────────────────────────────────────┐
  │  Lokalt (utviklermaskin)                                      │
  │                                                               │
  │  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐  │
  │  │ NVE ArcGIS   ├─►│ Last ned PDF  ├─►│ OpenDataLoader    │  │
  │  │ (kraftverk + │  │ konsesjons-   │  │ (Java + Docling + │  │
  │  │  vedlegg)    │  │ dokument      │  │  EasyOCR)         │  │
  │  └──────────────┘  └───────────────┘  └────────┬──────────┘  │
  │                                                │              │
  │                                                ▼              │
  │                         ┌─────────────────────────────────┐   │
  │                         │ Filtrer relevante setninger      │   │
  │                         │ (minstevann / slipp-keywords)    │   │
  │                         └──────────────┬──────────────────┘   │
  │                                        │                      │
  │                                        ▼                      │
  │                         ┌─────────────────────────────────┐   │
  │                         │ Ollama (gemma4:e4b-it-q4_K_M)   │   │
  │                         │ → strukturerte claims (JSON)     │   │
  │                         └──────────────┬──────────────────┘   │
  │                                        │                      │
  │                                        ▼                      │
  │                         ┌─────────────────────────────────┐   │
  │                         │ Assembler til NVEID-format       │   │
  │                         │ (sommer/vinter, l/s, periode)    │   │
  │                         └──────────────┬──────────────────┘   │
  │                                        │                      │
  │                                        ▼                      │
  │                         backend/data/minimumflow.json         │
  └────────────────────────────────────────┬──────────────────────┘
                                           │ upload til R2
                                           ▼
                            ┌─────────────────────────────────┐
                            │ R2: hydroguide-api-data          │
                            │ serveres via /api/nveid           │
                            └─────────────────────────────────┘
```

### 2. Rapportgenerering (sky, per request)

```
  Frontend                                    AI Worker (hydroguide-w-r2)
     │                                              │
     │  POST /api/polish-report                     │
     │  { tilgangskodeHash, prosjekt, ... }         │
     ▼                                              │
  ┌─────────────────────┐                           │
  │ Pages Functions      │                           │
  │ polish-report.js     │                           │
  │  • rate limit        │                           │
  │  • valider kode      │                           │
  │  • service-binding ──┼──────────────────────────►│
  └─────────────────────┘                           │
                                ┌───────────────────┴──────────────┐
                                │ 1. Bygg query fra brukerens svar  │
                                │ 2. Hent evidens:                  │
                                │    AutoRAG / KV / Vectorize       │
                                │ 3. Bygg prompt med evidens        │
                                │ 4. OpenAI via AI Gateway          │
                                │    (cache + retry)                │
                                │ 5. Self-feedback: verifiser       │
                                │    at fakta matcher evidens       │
                                │ 6. Returner { text }              │
                                └───────────────────┬──────────────┘
                                                    │
     ◄──────────────────────────────────────────────┘
     rapport vises i frontend
```

## Dokumentasjon

| Dokument | Innhold |
|----------|---------|
| [Frontend](frontend.md) | React-appen: sider, komponenter, beregninger, i18n, standalone-kart |
| [Cloudflare](cloudflare-dokumentasjon.md) | Workers, bindings, storage, deploy, sikkerhet |
| [AI](ai-dokumentasjon.md) | All KI: rapportgenerering (Cloudflare), minstevannføring-pipeline (lokal), retrieval, OCR |
| [Backend](backend-dokumentasjon.md) | API-endepunkter, beregningskjerne, data, PDF-generatorer, vedlikeholdsskript |

## Tech stack

| Lag | Teknologi |
|-----|-----------|
| Frontend | React, Vite, TypeScript, Tailwind CSS, Leaflet |
| Backend (edge) | Cloudflare Workers, Pages Functions, KV, R2, Vectorize |
| AI (edge) | OpenAI via AI Gateway, Workers AI, AutoRAG |
| AI (lokal) | Ollama (Gemma 4), OpenDataLoader, EasyOCR/Docling |
| Data | NVE ArcGIS, Geonorge, Kartverket, PVGIS (JRC) |
