# HydroGuide Arkitektur

Oppdatert: 2026-05-02

HydroGuide er delt i tre hovuddelar:

1. Ei React/Vite-nettside på Cloudflare Pages.
2. Fire Cloudflare Workers med tydelege ansvar.
3. Ein lokal NVE-pipeline som byggjer minstevassforing-data.

## Cloudflare

```text
hydroguide.no
  -> Cloudflare Pages
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

`hydroguide-ai` er intern. Nettsida kallar ikkje han direkte.

## Lagring

| Lagring | Namn | Bruk |
|---------|------|------|
| KV | `API_KEYS` | API-noklar og rate limit |
| KV | `REPORT_RULES` | Rapportreglar og faste utdrag |
| R2 | `hydroguide-minimum-flow` | `api/minimumflow.json` |
| R2 | `hydroguide-ai-reference` | AI-referansar og embeddings |

## Dataflyt

### Bereknings-API

```text
Kunde/app
  -> POST /api/calculations
  -> hydroguide-api
  -> API_KEYS
  -> calculation core
```

### Minstevassforing

```text
Lokal pipeline
  -> backend/data/minimumflow.json
  -> R2 hydroguide-minimum-flow
  -> GET /api/nveid/{nveID}/minimum-flow
```

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

Admin er med vilje ikkje under `/api/*`.

## Dokumentasjon

| Dokument | Innhald |
|----------|---------|
| [Frontend](frontend.md) | React-app, sider, rapport og build |
| [Backend](backend-dokumentasjon.md) | Endpoint-handlarar og scripts |
| [Cloudflare](cloudflare-dokumentasjon.md) | Workers, bindings, deploy og sikkerheit |
| [AI](ai-dokumentasjon.md) | Rapport-AI og lokal minstevassforing-pipeline |
