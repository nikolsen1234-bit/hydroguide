# HydroGuide Cloudflare-dokumentasjon

Oppdatert: 2026-04-29

## Arkitektur

HydroGuide kjører på tre Cloudflare-overflater:

```
hydroguide.no
│
├── Cloudflare Pages              statisk frontend (React/Vite SPA)
│   └── Pages Functions           fallback for ruter Worker-en ikke fanger
│       └── /api/polish-report    KI-rapportgenerering (eneste rute her)
│
├── Worker: hydroguide-api        fanger /api/* via route patterns
│   └── /api/{health,calculations,nveid,docs,keys,
│            place-suggestions,pvgis-tmy,terrain-profile}
│
└── Worker: hydroguide-w-r2       AI Worker (RAG mot NVE-korpus)
    └── intern service-binding fra polish-report
```

**Hvorfor delt opp i flere lag:**

- **Worker-en** kjører globalt på Cloudflare-edge, har lavere kald-start enn
  Pages Functions, og holder svaret på offentlige ruter (NVEID, beregninger,
  helsesjekk) raskt og forutsigbart.
- **Pages Functions** har tilgang til Pages-spesifikke bindinger
  (CSP-middleware, static-asset-fallback) og fanger opp ruter som Worker-en ikke
  har route pattern for. KI-rapporten ligger her fordi den trenger middleware-CSP
  og service-binding mot AI-worker.
- **AI Worker** er separat fordi RAG-pipelinen har tunge AI-kall (embeddings,
  generation), egne hemmeligheter, og et annet livssyklusbehov enn det vanlige
  API-et.

## Endepunkter

### Offentlig API

Dokumentert i Swagger UI på `/api/docs?ui`. Dette er ruter som er ment å bli
brukt eksternt (av andre verktøy, ikke bare HydroGuide-frontenden).

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET | `/api/docs` | OpenAPI-spec (JSON) |
| GET | `/api/docs?ui` | Swagger UI |
| GET | `/api/health` | Helsesjekk for uptime-monitorering |
| GET, POST | `/api/calculations` | Energiberegning (krever Bearer-token) |
| GET | `/api/nveid` | Oversikt over tilgjengelige NVEID-endepunkter |
| GET | `/api/nveid/{nveID}` | Meny for én stasjon |
| GET | `/api/nveid/{nveID}/minimum-flow` | Minstevannføring-data |
| GET | `/api/nveid/{nveID}/concession` | NVE-konsesjonslenke |
| GET | `/api/pvgis-tmy` | TMY soldata for koordinater |

### Frontend-hjelpere

Kallable fra appen, ikke listet i Swagger fordi de er proxy-er for tredjepart
(Geonorge, Kartverket, AI-worker) som ikke gir mening uten HydroGuide-konteksten:

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| POST | `/api/place-suggestions` | Stedsnavn-oppslag (Geonorge) |
| POST | `/api/terrain-profile` | Terrengprofil (Kartverket) |
| POST | `/api/polish-report` | KI-rapportgenerering (Pages Functions) |

### Admin

Auth-gated, ikke lenket fra UI. Bruker eget admin-token, ikke vanlig API-nøkkel.

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET, POST | `/api/keys` | API-nøkkeladministrasjon (rotering, oppretting) |

## Workers

### hydroguide-api

Hovedinngangen for `/api/*`-trafikk.

**Source:** `backend/api-worker/index.js`
**Config:** `backend/api-worker/wrangler.jsonc`

Route patterns (i wrangler.jsonc) — Worker-en starter kun for URL-er som matcher
disse, alt annet faller tilbake til Pages:
- `hydroguide.no/api/health*`
- `hydroguide.no/api/nveid*`
- `hydroguide.no/api/place-suggestions*`
- `hydroguide.no/api/terrain-profile*`
- `hydroguide.no/api/pvgis-tmy*`
- `hydroguide.no/api/calculations*`
- `hydroguide.no/api/docs*`
- `hydroguide.no/api/keys*`

Bindinger (det Worker-en faktisk har tilgang til ved kjøretid):

| Binding | Type | Resource | Hva den brukes til |
|---------|------|----------|--------------------|
| `API_KEYS` | KV | KV-namespace `API_KEYS` | slå opp kunde-API-nøkler for `/api/calculations` og admin |
| `MINIMUMFLOW_R2` | R2 | bucket `hydroguide-api-data` | les `minimumflow.json` for `/api/nveid` |
| `MINIMUMFLOW_OBJECT_KEY` | env | `api/minimumflow.json` | filsti-konfig (gjør det enkelt å bytte uten kode-endring) |

### hydroguide-w-r2 (AI Worker)

RAG-pipeline (Retrieval-Augmented Generation) for KI-rapportgenerering. Henter
relevant evidens fra NVE-korpus og lar OpenAI/Workers AI skrive rapporten.

**Source:** `backend/services/ai/index.ts`
**Config:** `backend/config/wrangler.jsonc`

Bindinger:

| Binding | Type | Resource | Hva den brukes til |
|---------|------|----------|--------------------|
| `AI` | Workers AI | (managed) | embeddings + fallback-modell |
| `R2_BUCKET` | R2 | bucket `hydroguide-r2` | NVE-korpus med pre-genererte embeddings |
| `PROMPT_KV` | KV | KV-namespace `PROMPT_KV` | bucket-inndelt evidens for raskt oppslag |
| `WORKER_API_KEY` | Secret | — | Bearer-auth som beskytter worker-en fra alt unntatt polish-report |
| `AI_GATEWAY_AUTH_TOKEN` | Secret | — | auth mot Cloudflare AI Gateway |
| `AI_SEARCH_API_TOKEN` | Secret | — | auth mot AutoRAG/AI Search |
| `AI_EXPORT_PASSWORD_HASH` | Secret | — | sammenligningshash for eksportkoden brukeren skriver inn |

Env-variabler styrer modellvalg (`OPENAI_MODEL_PRIMARY`, `WORKERS_AI_FALLBACK_MODEL`),
gateway-konfig (`AI_GATEWAY_*`) og retrieval-strategi (`RETRIEVAL_BACKEND`,
`AI_SEARCH_*`). Full liste i `backend/config/.dev.vars.example`.

## Storage

### KV-namespaces

KV (Key-Value) er Cloudflares globale, eventuelt-konsistente nøkkel-verdi-lager.
Lavt latency for lesing, perfekt for små data som ofte trengs.

| Namespace | Bruk |
|-----------|------|
| `API_KEYS` | API-nøkler for `/api/calculations` og `/api/keys` |
| `PROMPT_KV` | Bucketed NVE-evidens for RAG-retrieval |

### R2-buckets

R2 er Cloudflares S3-kompatible objektlager. Brukes for større filer eller
data som ikke trengs hver request.

| Bucket | Bruk |
|--------|------|
| `hydroguide-api-data` | `minimumflow.json` (én fil med all minstevannføring per NVEID) |
| `hydroguide-r2` | NVE-korpus oppdelt i chunks med embeddings |
| `hydroguide-assets` | Statiske assets (logoer, bilder, fonter) |

### AI Search / AutoRAG

`hydroguide-w-r2` bruker `env.AI.autorag(env.AI_SEARCH_INSTANCE)` for semantisk
søk mot NVE-korpus. Det betyr: brukeren spør "hva er kravene til
fiskepassasje?", AutoRAG finner de mest relevante delene av korpuset basert på
embeddings, og generation-modellen får dem som kontekst når den skriver
rapporten. Fallback til legacy KV-buckets om AI Search er deaktivert.

### AI Gateway

Alle worker AI-kall går gjennom Cloudflare AI Gateway. Fordelene:

- **Caching**: like prompt → samme svar uten å betale OpenAI-kostnad to ganger
- **Retry**: automatisk retry ved transient feil
- **Logging**: vi ser hver kall, latency og kostnad i Cloudflare-dashbordet

Aktivert via `AI_GATEWAY_ENABLED=true` med tilhørende `AI_GATEWAY_*`-konfig.

## Deploy

### Pages (frontend + Pages Functions)

Bygges med `npm run build:test`:

1. `tsc -b && vite build` produserer `frontend/dist/`
2. `update-build-info.mjs` skriver `dist/build-info.json` (commit-hash + tid)
3. `copy-build-to-test.mjs` kopierer `dist/` + kuraterte `functions/` til `test-deploy/`

`test-deploy/` deployes manuelt (eller via CI) til Pages-prosjektet. Inneholder
kun det som faktisk trengs i runtime — ingen dokumentasjon eller dev-skript.

### Workers

Bruk wrangler:

```bash
cd backend/api-worker
wrangler deploy

cd backend/services/ai
wrangler deploy --config ../../config/wrangler.jsonc
```

`wrangler deploy --dry-run` validerer config + bindinger uten å publisere.
Bruk dette først hver gang for å fange feilstavet binding-navn eller manglende
hemmeligheter.

## Konfigurasjon

Wrangler-filer i repo bruker `REPLACE_WITH_*`-plassholdere — det betyr at filen
kan committes til en offentlig repo uten at faktiske Cloudflare-IDer lekker:

- `backend/api-worker/wrangler.jsonc`
- `backend/config/wrangler.jsonc`

Faktiske ID-er og hemmeligheter ligger i `.secrets` (kryptert med git-crypt) og
`.dev.vars` (gitignored). Mal i `backend/config/.dev.vars.example`.

For lokal utvikling:

```bash
cp backend/config/.dev.vars.example backend/config/.dev.vars
# fyll inn faktiske verdier (ikke commit!)
wrangler dev
```

## Sikkerhet

- **CSP** (Content Security Policy): `backend/_middleware.js` setter global CSP
  for SPA-ruter. `/api/docs` har egen CSP fordi Swagger UI trenger inline-script
  med nonce. Standalone-kart (`nve-kart-standalone`, `solar-location-map`) har
  også egne CSP-er fordi de bruker Leaflet og NVE-tile-servere som ikke matcher
  hovedreglene.
- **CORS**: `/api/calculations` og offentlige NVEID-ruter har wildcard CORS
  (Bearer-token-modell — som GitHub eller OpenAI). `/api/keys` bruker en
  restricted origin allowlist. `/api/polish-report` bruker `CORS_OPTIONS_HEADERS`
  med eksport-kode-validering før KI-kallet kjøres.
- **Rate limit**: KV-backed for offentlig API (per-key, kvote settes i
  KV-record), Cache API + in-memory for proxy-ruter (per-IP, hindrer at én bruker
  lager DoS).
- **Hemmeligheter**: validert via `constantTimeEquals` ved sammenligning. Det
  hindrer at en angriper kan måle responstid for å gjette tegn-for-tegn.
  Hash-then-XOR brukes for admin-token (skjuler i tillegg input-lengde).
- **Body size**: alle POST-ruter har eksplisitte byte-caps (1 KB–512 KB
  avhengig av rute). Forhindrer at noen kan sende en multi-megabyte payload som
  spiser worker-CPU.
