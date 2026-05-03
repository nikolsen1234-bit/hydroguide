# HydroGuide

Verktoy og tenester for NVE-konsesjonsdata, minstevassforing og energiberekning.

## Struktur

```text
frontend/                     React/Vite-app
backend/
  api/                        Delte API-handlarar
  workers/                    Worker entrypoints for API, report, AI og admin
  cloudflare/                 Wrangler-config for kvar Cloudflare Worker
  services/ai/                Intern rapport-AI
  services/calculations/      Delt berekningskjerne
  data/minimumflow.json       Minstevassforing per NVEID
  config/                     Generert/offentleg Cloudflare-metadata
  scripts/                    Vedlikehald for R2, KV og deploy-config
tools/
  minstevann/                 NVE-dokument -> minstevassforing -> NVEID
  horizon_pdf.py              Horisontprofil PDF-generator
  solar_position_pdf.py       Solposisjon PDF-generator
docs/                         Dokumentasjon
.ai/                          Agent-dokumentasjon og lokal worklog
```

## Kom I Gang

```bash
cd frontend
npm install
npm run dev
npm run build:test
```

## Minstevassforing

```bash
python tools/minstevann/run.py plant 1696
python tools/minstevann/run.py batch --n 500
python tools/minstevann/run.py batch --resume
python tools/minstevann/run.py export
```

Sjå [AI-dokumentasjon](docs/ai-dokumentasjon.md) for pipeline, OCR og KI-flyt.

## Dokumentasjon

- [Arkitektur](docs/arkitektur.md)
- [Frontend](docs/frontend.md)
- [Cloudflare](docs/cloudflare-dokumentasjon.md)
- [AI](docs/ai-dokumentasjon.md)
- [Backend](docs/backend-dokumentasjon.md)

## Krav

- Node 20+
- npm
