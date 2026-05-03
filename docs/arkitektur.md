# HydroGuide Arkitektur

Oppdatert: 2026-05-03

HydroGuide er delt i tre hovuddelar:

1. Ein statisk React/Vite-frontend på `hydroguide.no`.
2. Fire Cloudflare Workers med tydelege ansvar.
3. Ein lokal NVE-pipeline som byggjer minstevassføring-data.

## Cloudflare

```text
hydroguide.no
  -> statisk frontend

  -> hydroguide-api
     -> /api/health
     -> /api/docs
     -> /api/calculations
     -> /api/nveid
     -> /api/pvgis-tmy
     -> /api/place-suggestions
     -> /api/terrain-profile

  -> hydroguide-report
     -> /api/report
     -> service binding: REPORT_AI_WORKER
        -> hydroguide-ai

  -> hydroguide-admin
     -> /admin/*
```

`hydroguide-ai` har ingen offentleg route. Nettsida kallar `hydroguide-report`.

## Lagring

| Lagring | Namn | Bruk |
|---------|------|------|
| KV | `API_KEYS` | API-nøklar, status og rate limit |
| KV | `REPORT_RULES` | Rapportreglar og faste utdrag |
| R2 | `hydroguide-minimum-flow` | `api/minimumflow.json` for NVEID-ruter |
| R2 | `hydroguide-ai-reference` | NVE-referansar og embeddings |
| R2 | `hydroguide-assets` | Offentlege filer under `files.hydroguide.no` |

## Dataflyt

### Bereknings-API

```text
Kunde eller app
  -> POST /api/calculations
  -> hydroguide-api
  -> API_KEYS
  -> calculation core
```

### Minstevassføring

```text
Lokal pipeline
  -> backend/data/minimumflow.json
  -> R2 hydroguide-minimum-flow
  -> GET /api/nveid/{nveID}/minimum-flow
```

Rotrutene for NVEID viser meny og neste steg.

### Rapport

```text
Frontend
  -> POST /api/report
  -> hydroguide-report
  -> REPORT_AI_WORKER
  -> hydroguide-ai
  -> REPORT_RULES + AI_REFERENCE_BUCKET + AI Gateway
```

### Admin

```text
Operator
  -> /admin/keys
  -> hydroguide-admin
  -> API_KEYS
```

Admin-ruter ligg under `/admin/*`.

## Dokumentasjon

| Dokument | Innhald |
|----------|---------|
| [Frontend](frontend.md) | React-app, sider, rapport og build |
| [Backend](backend-dokumentasjon.md) | Endpoint-handlarar og scripts |
| [Cloudflare](cloudflare-dokumentasjon.md) | Workers, bindings, deploy og sikkerheit |
| [AI](ai-dokumentasjon.md) | Rapport-AI og lokal minstevassføring-pipeline |
