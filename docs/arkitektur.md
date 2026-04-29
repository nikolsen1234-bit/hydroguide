# HydroGuide — Arkitekturoversikt

Oppdatert: 2026-04-29

## Hva er HydroGuide

HydroGuide er et verktøy for planlegging av vannkraft- og solenergianlegg i Norge. Systemet har tre hoveddeler:

1. En **nettside** der brukere konfigurerer anlegg, kjører beregninger og genererer rapporter
2. Et **API** som serverer beregninger, minstevannføring-data og tredjeparts-proxyer
3. En **lokal pipeline** som leser NVE-konsesjonsdokumenter og bygger en database over minstevannføringskrav

## Systemdiagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Brukerens nettleser                                            │
│  hydroguide.no (React SPA)                                      │
└──────────┬──────────────────────────────────────────────────────┘
           │
     ┌─────▼──────────────────────────────────────────────┐
     │  Cloudflare Edge                                    │
     │                                                     │
     │  ┌─────────────────────┐  ┌──────────────────────┐ │
     │  │ hydroguide-api      │  │ Pages Functions      │ │
     │  │ (Worker)            │  │                      │ │
     │  │                     │  │ /api/polish-report ──┼─┼──► hydroguide-w-r2
     │  │ /api/nveid          │  │                      │ │    (AI Worker)
     │  │ /api/calculations   │  └──────────────────────┘ │
     │  │ /api/pvgis-tmy      │                            │
     │  │ /api/docs           │  ┌──────────────────────┐ │
     │  │ ...                 │  │ Storage              │ │
     │  └─────────┬───────────┘  │ KV, R2, Vectorize   │ │
     │            │              │ AI Gateway           │ │
     │            └──────────────┤                      │ │
     │                           └──────────────────────┘ │
     └────────────────────────────────────────────────────┘

     ┌────────────────────────────────────────────────────┐
     │  Lokalt (utviklermaskin)                            │
     │                                                     │
     │  Minstevannføring-pipeline                          │
     │  NVE → PDF → OpenDataLoader → Ollama → JSON         │
     │                                                     │
     │  Output: backend/data/minimumflow.json               │
     │  Lastes opp til R2 → serveres via /api/nveid         │
     └────────────────────────────────────────────────────┘
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
