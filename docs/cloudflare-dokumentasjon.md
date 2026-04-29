# HydroGuide Cloudflare-dokumentasjon

Oppdatert: 2026-04-29

## Arkitektur

HydroGuide kjører på Cloudflare Pages med Functions:

```
hydroguide.no
├── Cloudflare Pages        → frontend (React/Vite SPA)
├── Pages Functions         → /api/* endepunkter
├── AI Worker (separat)     → rapportgenerering med NVE-evidens
├── KV                      → NVE-korpus (bucketert evidens)
├── R2                      → korpuslagring
├── Vectorize               → semantisk søk
└── AI Gateway              → proxy mot OpenAI med caching og retry
```

## Endepunkter

### Offentlig API

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET | `/api/docs` | OpenAPI-spec (JSON) |
| GET | `/api/docs?ui` | Swagger UI |
| GET | `/api/health` | Helsesjekk |
| GET/POST | `/api/calculations` | Energiberegning |
| GET | `/api/nveid` | Oversikt over tilgjengelige stasjoner |
| GET | `/api/nveid/{nveID}` | Meny for én stasjon |
| GET | `/api/nveid/{nveID}/minimum-flow` | Minstevannføring-data |
| GET | `/api/nveid/{nveID}/concession` | Konsesjonslenke |
| GET | `/api/pvgis-tmy` | TMY soldata for koordinater |

### Frontend-hjelpere (ikke offentlig dokumentert)

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| POST | `/api/place-suggestions` | Stedsnavn-oppslag |
| POST | `/api/terrain-profile` | Terrengprofil |
| POST | `/api/polish-report` | KI-rapportgenerering |

### Admin

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET/POST | `/api/keys` | API-nøkkeladministrasjon |

## Bindings

| Binding | Type | Funksjon |
|---------|------|----------|
| `API_KEYS` | KV | API-nøkler for beregnings-API og admin |
| `AI_WORKER` | Service | Rapportgenerering |
| `WORKER_API_KEY` | Secret | Auth mot AI Worker |
| `INTERNAL_SERVICE_TOKEN` | Secret | Admin-token |
| `AI_EXPORT_PASSWORD_HASH` | Secret | Eksportkode for KI-flyten |
| `PROMPT_KV` | KV | NVE-korpus for retrieval |
| `R2_BUCKET` | R2 | Korpuslagring |
| `VECTORIZE_INDEX` | Vectorize | Semantisk søk |
| `AI` | AI | AutoRAG |
| `AI_GATEWAY_*` | Env | Gateway-konfigurasjon |

## Deploy-pakke

`npm run build:test` bygger deploy-pakken:

1. Bygger frontend (`dist/`)
2. Oppdaterer `build-info.json`
3. Kopierer `dist/` og kuraterte `functions/` til `test-deploy/`

### Innhold i deploy-pakken

- Frontend: `index.html`, `assets/`, statiske filer
- Functions: `_middleware.js`, alle `api/*.js`-handlers, `services/calculations/`
- Ikke inkludert: dokumentasjon, scripts, testfiler, lokale artefakter

## Wrangler-konfigurasjon

To konfigurasjoner:

- `backend/config/wrangler.jsonc` — Pages Functions (hoveddeploy)
- `backend/api-worker/wrangler.jsonc` — AI Worker (separat deploy)

Begge bruker `REPLACE_WITH_*`-plassholdere for Cloudflare-IDer. Faktiske verdier ligger i `.secrets` (kryptert med git-crypt).

## Build og deploy

```bash
cd frontend
npm install          # installerer dependencies + setter opp git hooks
npm run build:test   # bygger deploy-pakke til test-deploy/
npm run check:knip   # sjekk unused exports
```

`test-deploy/` er gitignored og deployes manuelt eller via CI.
