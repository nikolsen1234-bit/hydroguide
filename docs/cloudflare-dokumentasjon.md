# HydroGuide Cloudflare-dokumentasjon

Oppdatert: 2026-05-02

## Arkitektur

HydroGuide bruker tre Cloudflare-overflater:

```
hydroguide.no
│
├── Cloudflare Pages              statisk frontend (React/Vite SPA)
│   └── Pages Functions           fallback for ruter Worker-en ikke fanger
│       └── /api/polish-report    KI-rapportgenerering (eneste rute her)
│
├── Worker: hydroguide-api        fanger eksplisitte /api-ruter via route patterns
│   └── /api/{health,calculations,nveid,docs,keys,
│            place-suggestions,pvgis-tmy,terrain-profile}
│
└── Worker: hydroguide-w-r2       AI Worker (RAG mot NVE-korpus)
    └── intern service-binding fra polish-report
```

**Hvorfor delt opp i flere lag:**

- **Worker-en** håndterer de API-rutene som er listet i
  `backend/api-worker/wrangler.jsonc`. Den tar NVEID, beregninger, helsesjekk,
  dokumentasjon, nøkkeladministrasjon og noen frontend-proxyer.
- **Pages Functions** følger filbasert routing i deploy-pakken. I normal drift
  er `/api/polish-report` den viktige API-ruten her, fordi `hydroguide-api`
  ikke har route pattern for den. Den kaller AI Worker via service binding.
- **AI Worker** er separat fordi rapportgenerering og retrieval har egne
  bindinger, egne hemmeligheter og en annen deploy-syklus enn det vanlige
  API-et.

## Systemoversikt

```
┌─────────────────────────────────────────────────────────────────────┐
│  Brukerens nettleser                                                │
│  hydroguide.no (React SPA)                                          │
└────────────────┬────────────────────────────────────────────────────┘
                 │
       ┌─────────▼─────────────────────────────────────────────┐
       │  Cloudflare Edge                                      │
       │                                                       │
       │  ┌────────────────────┐  ┌─────────────────────────┐  │
       │  │ hydroguide-api     │  │ Pages Functions         │  │
       │  │ (Worker)           │  │                         │  │
       │  │                    │  │ /api/polish-report ─────┼──┐
       │  │ /api/nveid         │  │                         │  │
       │  │ /api/calculations  │  └─────────────────────────┘  │
       │  │ /api/pvgis-tmy     │                               │
       │  │ /api/docs          │  ┌─────────────────────────┐  │
       │  │ /api/health        │  │ hydroguide-w-r2         │◄─┘
       │  │ ...                │  │ (AI Worker)             │  │
       │  └────────┬───────────┘  │ • RAG mot NVE-korpus    │  │
       │           │              │ • OpenAI / Workers AI   │  │
       │           │              └───────────┬─────────────┘  │
       │           │                          │                │
       │           ▼                          ▼                │
       │  ┌──────────────────────────────────────────────────┐ │
       │  │ Lagring                                          │ │
       │  │ KV (API_KEYS, PROMPT_KV)                         │ │
       │  │ R2 (minimumflow-data, NVE-korpus)                │ │
       │  │ AI Gateway (caching/retry mot OpenAI)            │ │
       │  └──────────────────────────────────────────────────┘ │
       └───────────────────────────────────────────────────────┘

       ┌───────────────────────────────────────────────────────┐
       │  Lokalt (utviklermaskin)                              │
       │                                                       │
       │  Minstevannføring-pipeline                            │
       │  NVE → PDF → OpenDataLoader → Ollama → JSON           │
       │                                                       │
       │  Output: backend/data/minimumflow.json                │
       │  Lastes opp til R2 → serveres via /api/nveid          │
       └───────────────────────────────────────────────────────┘
```

## Endepunkter

### Offentlig API

`/api/docs?ui` viser Swagger UI for OpenAPI-spesifikasjonen. Den dekker NVEID
og `POST /api/calculations`. Andre kallbare ruter er listet her fordi de finnes
i runtime, men de er ikke nødvendigvis med i Swagger.

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET | `/api/docs` | OpenAPI-spec (JSON) |
| GET | `/api/docs?ui` | Swagger UI |
| GET | `/api/health` | Helsesjekk for uptime-monitorering |
| GET | `/api/calculations` | Endepunkt-info |
| POST | `/api/calculations` | Energiberegning (krever Bearer-token) |
| GET | `/api/nveid` | Oversikt over tilgjengelige NVEID-endepunkter |
| GET | `/api/nveid/{nveID}` | Meny for én stasjon |
| GET | `/api/nveid/{nveID}/minimum-flow` | Minstevannføring-data |
| GET | `/api/nveid/{nveID}/concession` | NVE-konsesjonslenke |
| GET | `/api/pvgis-tmy` | TMY soldata for koordinater |

### Frontend-hjelpere

Kallbare fra appen, ikke listet i Swagger fordi de er frontend-spesifikke
proxyer mot Geonorge, Kartverket og AI Worker:

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

Hovedinngangen for API-rutene som har route pattern i `wrangler.jsonc`.

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
| `API_KEY_HASH_SECRET` | Secret | — | HMAC-verifisering av nye API-nøkkel-records |
| `INTERNAL_SERVICE_TOKEN` | Secret | — | admin-token for `/api/keys` |
| `MINIMUMFLOW_R2` | R2 | bucket `hydroguide-api-data` | les `minimumflow.json` for `/api/nveid` |
| `MINIMUMFLOW_OBJECT_KEY` | env | `api/minimumflow.json` | filsti-konfig (gjør det enkelt å bytte uten kode-endring) |

### Pages Functions

Pages-deployen får `functions/`-mappen fra `test-deploy/`. Worker-rutene over
tar mesteparten av `/api/*`, men `/api/polish-report` går via Pages Functions i
normal drift.

Bindinger som trengs for `/api/polish-report`:

| Binding | Type | Hva den brukes til |
|---------|------|--------------------|
| `AI_WORKER` | Service binding | intern kall til `hydroguide-w-r2` |
| `WORKER_API_KEY` | Secret | Bearer-token sendt fra Pages Function til AI Worker |
| `AI_EXPORT_PASSWORD_HASH` | Secret | validerer eksportkoden før KI-kallet kjøres |

### hydroguide-w-r2 (AI Worker)

Worker for rapportgenerering og NVE-retrieval. Den henter evidens fra KV,
AI Search/AutoRAG eller Vectorize og bruker OpenAI via AI Gateway til selve
tekstgenereringen. Workers AI brukes til embeddings og fallback-relaterte
retrieval-operasjoner, ikke som hovedgenerator i dagens kode.

**Source:** `backend/services/ai/index.ts`
**Config:** `backend/config/wrangler.jsonc`

Bindinger:

| Binding | Type | Resource | Hva den brukes til |
|---------|------|----------|--------------------|
| `AI` | Workers AI | (managed) | embeddings og `env.AI.autorag(...)` |
| `R2_BUCKET` | R2 | bucket `hydroguide-r2` | NVE-korpus med pre-genererte embeddings |
| `PROMPT_KV` | KV | KV-namespace `PROMPT_KV` | bucket-inndelt evidens for raskt oppslag |
| `WORKER_API_KEY` | Secret | — | Bearer-auth som beskytter worker-en fra alt unntatt polish-report |
| `AI_GATEWAY_AUTH_TOKEN` | Secret | — | auth mot Cloudflare AI Gateway |
| `AI_SEARCH_API_TOKEN` | Secret | — | auth mot AutoRAG/AI Search |

Env-variabler styrer modellvalg (`OPENAI_MODEL_PRIMARY`,
`OPENAI_MODEL_FALLBACK`), gateway-konfig (`AI_GATEWAY_*`), retrieval
(`RETRIEVAL_BACKEND`, `RETRIEVAL_STRATEGY`, `AI_SEARCH_*`, `VECTORIZE_*`) og
rapportmodus (`NARRATIVE_*`, `SELF_FEEDBACK_*`, `USER_FEEDBACK_ENABLED`).
Eksempelverdier ligger i `backend/config/.dev.vars.example`.

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

### AI Search / AutoRAG

Koden bruker i dag `env.AI.autorag(env.AI_SEARCH_INSTANCE)` når AI Search er
konfigurert, med REST-kall som fallback hvis token og account-id finnes. Nye
Cloudflare-docs anbefaler nå egne `ai_search` / `ai_search_namespaces`-bindinger.
Ved neste AI Search-oppgradering bør koden enten flyttes til de bindingene, eller
denne dokumentasjonen må si tydelig at prosjektet fortsatt bruker legacy
`env.AI.autorag(...)`. Hvis AI Search ikke gir treff eller ikke er konfigurert,
kan retrieval falle tilbake til
bucketert evidens i `PROMPT_KV` og eventuelt Vectorize når det er aktivert.

### AI Gateway

Tekstgenerering mot OpenAI går gjennom Cloudflare AI Gateway når
`AI_GATEWAY_ENABLED=true` og gateway-bindingene er satt. Workers AI- og
AI Search-kall går via sine egne bindinger eller REST-fallback, ikke gjennom
samme OpenAI Gateway-kall.

- **Caching**: identiske gateway-forespørsler kan treffe cache
- **Retry**: gateway-headerne setter antall forsøk, delay og backoff
- **Logging/innsyn**: gatewayen gir innsyn i kall, latency og kostnad i Cloudflare

Aktivert via `AI_GATEWAY_ENABLED=true` med tilhørende `AI_GATEWAY_*`-konfig.

## Deploy

### Pages (frontend + Pages Functions)

Bygges med `npm run build:test`:

1. `tsc -b && vite build` produserer `frontend/dist/`
2. `update-build-info.mjs` skriver `src/generated/build-info.json` med `updatedAt`
   og `copy-build-info-to-dist.mjs` kopierer den til `dist/build-info.json`
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

`wrangler deploy --dry-run` validerer config og binding-oppsett uten å publisere.
Bruk dette først for å fange feilstavet binding-navn og config-feil. Faktiske
hemmeligheter må fortsatt være satt i Cloudflare/Secrets Store før runtime virker.

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
- **Rate limit**: `/api/calculations` bruker KV-backed rate limit per
  API-nøkkel. Admin og proxy-ruter bruker in-memory/Cache API-varianter per IP.
- **Hemmeligheter**: validert via `constantTimeEquals` ved sammenligning. Det
  hindrer at en angriper kan måle responstid for å gjette tegn-for-tegn.
  Hash-then-XOR brukes for admin-token (skjuler i tillegg input-lengde).
- **Body size**: `readApiJsonBody()` strømleser offentlige API-bodyer og stopper
  ved 32 KB. Flere proxy- og AI-ruter har også egne caps, men noen av dem leser
  først bodyen med `request.text()` før størrelsen sjekkes. De bør derfor ikke
  beskrives som full streaming-beskyttelse.
