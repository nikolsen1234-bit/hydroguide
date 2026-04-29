# Backend-dokumentasjon

Oppdatert: 2026-04-29

Backend-kode, API-logikk, beregningskjerne, data og vedlikeholdsskript.

## Mappestruktur

```
backend/
├── api/                      API-handlers (Pages Functions + Worker)
│   ├── _apiUtils.js          Delte hjelpefunksjoner (auth, response)
│   ├── _constants.js         Konfigurasjonskonstanter
│   ├── _edgeUtils.js         Edge-spesifikke utilities (KV, caching)
│   ├── calculations.js       Energiberegning (GET/POST, Bearer-auth)
│   ├── docs.js               OpenAPI-spec og Swagger UI
│   ├── health.js             Helsesjekk-endepunkt
│   ├── nveid.js              Minstevannføring per NVEID (leser fra R2)
│   ├── place-suggestions.js  Proxy til Geonorge stedsnavn-API
│   ├── polish-report.js      KI-rapport-proxy til AI Worker
│   ├── pvgis-tmy.js          Proxy til EU PVGIS TMY-data
│   ├── terrain-profile.js    Proxy til Kartverket terrengprofil
│   └── keys/index.js         API-nøkkeladministrasjon (admin)
├── api-worker/               Selvstendig Worker for /api/*
│   ├── index.js              Router som importerer handlers fra api/
│   └── wrangler.jsonc        Worker-konfig med route patterns
├── services/
│   ├── ai/                   AI Worker (RAG-pipeline)
│   │   ├── index.ts          Entry point, routing, auth
│   │   ├── retrieval.ts      Evidensinnhenting (KV, AutoRAG, Vectorize)
│   │   ├── generation.ts     Prompt-bygging og modellkall
│   │   ├── auth.ts           CORS, constantTimeEquals, secret-resolving
│   │   ├── utils.ts          Hjelpefunksjoner
│   │   └── types.ts          TypeScript-typer, defaults, konstanter
│   └── calculations/
│       └── _calculationCore.js  Delt beregningslogikk (brukt av API og frontend)
├── config/
│   ├── wrangler.jsonc        Wrangler-konfig for AI Worker
│   └── .dev.vars.example     Mal for lokale hemmeligheter
├── data/
│   ├── minimumflow.json      Minstevannføring-database (generert av pipeline)
│   └── cloudflare-kv/
│       └── kv-seed.json      Seed-data for KV-namespaces
├── scripts/
│   ├── build-ai-search-corpus.mjs   Bygg NVE-korpus-chunks
│   ├── upload-corpus-to-r2.ps1      Last opp korpus til R2
│   ├── seed-kv.ps1                  Seed KV med bucketert evidens
│   └── fix-r2-metadata.mjs          Reparer R2-metadata
└── _middleware.js             Global middleware (CSP, feilhåndtering)
```

## Beregningskjerne

`_calculationCore.js` inneholder all deterministisk beregningslogikk:

- Inputnormalisering og validering
- Energiberegninger (solstråling, batteriautonomi, systemdimensjonering)
- Delt mellom `POST /api/calculations` (backend) og frontend-preview

Funksjonen tar inn et normalisert input-objekt og returnerer et komplett resultatobjekt. Ingen side-effekter, ingen nettverkskall.

## Data

### minimumflow.json

Generert av minstevannføring-pipelinen (`python run.py export`). Inneholder ~1500 norske vannkraftverk med minstevannføringskrav per NVEID. Lastes opp til R2-bucket `hydroguide-api-data` og serveres via `/api/nveid/{nveID}/minimum-flow`.

Se [AI-dokumentasjon](ai-dokumentasjon.md) for detaljer om hvordan dataen genereres.

### KV seed-data

`kv-seed.json` inneholder initiell data for KV-namespaces. Brukes av `seed-kv.ps1` ved oppsett av ny Cloudflare-konto.

## Vedlikeholdsskript

| Skript | Formål |
|--------|--------|
| `build-ai-search-corpus.mjs` | Parser NVE-veiledere til chunks med metadata |
| `upload-corpus-to-r2.ps1` | Laster opp chunks til R2 med embeddings |
| `seed-kv.ps1` | Skriver bucketert evidens til PROMPT_KV |
| `fix-r2-metadata.mjs` | Reparerer content-type og custom metadata i R2 |

Disse kjøres manuelt ved korpus-oppdateringer eller oppsett av ny konto.

## Middleware

`_middleware.js` kjører på alle Pages-ruter og setter:

- Content Security Policy (CSP) per rute-type
- Feilhåndtering med generiske feilmeldinger (ingen stack traces til klient)
- CORS-headers for API-ruter
