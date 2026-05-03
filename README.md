# HydroGuide

HydroGuide er eit verktøy for NVE-konsesjonsdata, minstevassføring og energiberekning for små vasskraftanlegg.

## Struktur

```text
frontend/                     React/Vite-app
backend/
  api/                        Delte API-handlarar
  workers/                    Cloudflare Worker entrypoints for API, report, AI og admin
  cloudflare/                 Wrangler-konfig for kvar Worker
  services/ai/                Intern rapport-AI
  services/calculations/      Delt berekningskjerne
  data/minimumflow.json       Lokal kopi av minstevassføring per NVEID
  config/                     Generert/offentleg Cloudflare-metadata
  scripts/                    Vedlikehald for Cloudflare, R2 og KV
tools/
  minstevann/                 NVE-dokument -> minstevassføring -> NVEID
  horizon_pdf.py              Horisontprofil PDF-generator
  solar_position_pdf.py       Solposisjon PDF-generator
docs/                         Dokumentasjon
.ai/                          Lokal agent-dokumentasjon og worklog
```

## Kom I Gang

```bash
cd frontend
npm ci
npm run dev
npm run build:test
```

`npm run build:test` byggjer frontend og kopierer resultatet til `test-deploy/`.

## Minstevassføring

```bash
python tools/minstevann/run.py plant 1696
python tools/minstevann/run.py batch --n 500
python tools/minstevann/run.py batch --resume
python tools/minstevann/run.py export
```

Sjå [AI-dokumentasjon](docs/ai-dokumentasjon.md) og [minstevann README](tools/minstevann/README.md) for OCR, LLM og eksportflyt.

## Dokumentasjon

- [Arkitektur](docs/arkitektur.md)
- [Frontend](docs/frontend.md)
- [Backend](docs/backend-dokumentasjon.md)
- [Cloudflare](docs/cloudflare-dokumentasjon.md)
- [AI og minstevassføring](docs/ai-dokumentasjon.md)

## Krav

- Node.js 22 LTS
- npm 10+
- Python 3.13+ for `tools/minstevann/`
- Java 21 for OpenDataLoader/OCR i minstevassføring-pipelinen
