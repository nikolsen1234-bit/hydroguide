# HydroGuide

Verktøy og tjenester for NVE-konsesjonsdata, minstevannføring og energiberegning.

## Struktur

```
frontend/                     React/Vite-app (energikonfigurasjon)
backend/
  api/                        API-endepunkter (/api/*)
  api-worker/                 Worker for hydroguide.no
  services/ai/                Cloudflare AI Worker (RAG mot NVE-korpus)
  services/calculations/      Delt beregningskjerne
  data/minimumflow.json       Minstevannføring per NVEID
  config/                     Wrangler-config
  scripts/                    Vedlikeholdsskript for korpus, R2 og KV
tools/
  minstevann/                 Minstevannføring-ekstraksjon (NVE → PDF → LLM → NVEID)
  horizon_pdf.py              Horisontprofil PDF-generator
  solar_position_pdf.py       Solposisjon PDF-generator
docs/                         Dokumentasjon
.ai/                          Agent-dokumentasjon og worklog
```

## Kom i gang

```bash
cd frontend
npm install         # installerer dependencies og setter opp git hooks
npm run dev         # Vite dev server på http://localhost:5173
npm run build:test  # bygger deploy-pakke til test-deploy/
```

## Minstevannføring-pipeline

Batch-pipeline som leser NVE-konsesjonsdokumenter og henter ut minstevannføringskrav automatisk:

```bash
python tools/minstevann/run.py plant 1696       # én stasjon
python tools/minstevann/run.py batch --n 500    # 500 stasjoner
python tools/minstevann/run.py batch --resume   # fortsett der den stoppet
python tools/minstevann/run.py export           # skriv til minimumflow.json
```

Se [KI-dokumentasjon](docs/ki-dokumentasjon.md) for detaljer om pipeline-arkitektur og modeller.

## Dokumentasjon

- [Arkitektur](docs/arkitektur.md) — oversikt over hele systemet
- [Frontend](docs/frontend.md) — React-app, sider, komponenter, build
- [Cloudflare](docs/cloudflare-dokumentasjon.md) — workers, bindings, storage, deploy, sikkerhet
- [AI](docs/ai-dokumentasjon.md) — rapportgenerering, minstevannføring-pipeline, OCR
- [Backend](docs/backend-dokumentasjon.md) — API-logikk, beregningskjerne, data, skript

## Dependencies

- Node 20+, npm

For minstevannføring-pipeline og andre lokale verktøy, se [tools/minstevann/README.md](tools/minstevann/README.md).
