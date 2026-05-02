# HydroGuide Cloudflare-dokumentasjon

Oppdatert: 2026-05-02

## Arkitektur

HydroGuide har én offentlig nettadresse, men Cloudflare kjører ikke all kode på
samme sted. Det er nyttig å skille mellom tre ting:

- **API-rute**: URL-en nettleseren kaller, for eksempel `/api/nveid` eller
  `/api/polish-report`.
- **Worker / Pages Function**: koden Cloudflare kjører for en rute.
- **Binding**: et internt navn i Cloudflare som kode bruker for å nå KV, R2,
  secrets eller en annen Worker. En binding er ikke en offentlig URL.

```
hydroguide.no
│
├── Frontend
│   └── Cloudflare Pages          leverer React/Vite-appen til nettleseren
│
├── API-ruter på hydroguide.no
│   ├── /api/polish-report        kjøres av Pages Function
│   │                             tar rapportgrunnlag fra frontend
│   │                             sjekker tilgangskode
│   │                             sender jobben videre via bindingen AI_WORKER
│   │
│   ├── /api/health               kjøres av Worker-en hydroguide-api
│   ├── /api/calculations         kjøres av Worker-en hydroguide-api
│   ├── /api/nveid                kjøres av Worker-en hydroguide-api
│   ├── /api/docs                 kjøres av Worker-en hydroguide-api
│   ├── /api/place-suggestions    kjøres av Worker-en hydroguide-api
│   ├── /api/pvgis-tmy            kjøres av Worker-en hydroguide-api
│   └── /api/terrain-profile      kjøres av Worker-en hydroguide-api
│
├── Worker: hydroguide-api        svarer på API-rutene over, bortsett fra polish-report
│
├── Pages Function                /api/polish-report
│   └── bruker AI_WORKER-bindingen for å sende rapportjobben til hydroguide-w-r2
│
└── Worker: hydroguide-w-r2       tar imot rapportgrunnlag fra polish-report
    └── bruker prompt, regler og NVE-korpus til å returnere KI-tekst
```

**Hvorfor delt opp i flere lag:**

- **Cloudflare Pages** leverer selve frontend-appen.
- **hydroguide-api** kjører de API-rutene som er satt opp som route patterns i
  `backend/api-worker/wrangler.jsonc`.
- **/api/polish-report** ligger som Pages Function fordi den hører til
  rapportflyten i frontend-deployen. Den validerer tilgangskode og sender bare
  godkjent rapportgrunnlag videre.
- **hydroguide-w-r2** lager KI-teksten. Den blir kalt fra `polish-report`
  gjennom bindingen `AI_WORKER`.
- **/api/keys** finnes også i `hydroguide-api`, men er admin/auth og er derfor
  ikke med i førstediagrammet.

## Systemoversikt

```
Nettleser
  |
  |  hydroguide.no
  v
Cloudflare
  |
  +-- Cloudflare Pages
  |     +-- statisk React/Vite-frontend
  |     +-- Pages Function: /api/polish-report
  |           +-- validerer tilgangskode
  |           +-- sender rapportgrunnlag til hydroguide-w-r2 via AI_WORKER
  |
  +-- Worker: hydroguide-api
  |     +-- /api/health
  |     +-- /api/calculations
  |     +-- /api/nveid
  |     +-- /api/docs
  |     +-- /api/place-suggestions
  |     +-- /api/pvgis-tmy
  |     +-- /api/terrain-profile
  |     +-- /api/keys (admin/auth)
  |
  +-- Worker: hydroguide-w-r2
        +-- mottar rapportgrunnlag fra /api/polish-report
        +-- finner relevante utdrag i NVE-korpuset
        +-- bruker OpenAI via AI Gateway til å lage KI-tekst

Lagring og interne ressurser
  +-- KV: API_KEYS, PROMPT_KV
  +-- R2: minimumflow-data, NVE-korpus
  +-- Cloudflare AI: embeddings og AutoRAG/AI Search-kall
  +-- AI Gateway: caching, retry og logging for OpenAI-kall

Lokalt på utviklermaskin
  +-- Minstevannføring-pipeline
  +-- NVE -> PDF -> OpenDataLoader -> Ollama -> JSON
  +-- Output: backend/data/minimumflow.json
```

`AI_WORKER` er en service binding. Det betyr at Pages Function-en kan kalle
Worker-en `hydroguide-w-r2` inne i Cloudflare. Nettleseren kaller aldri
`hydroguide-w-r2` direkte.

## Endepunkter

### Offentlig API

`/api/docs?ui` viser Swagger UI for OpenAPI-spesifikasjonen. Swagger dekker
NVEID-rutene og `POST /api/calculations`. Andre ruter kan være åpne for appen,
men skal ikke presenteres som offentlig API-kontrakt bare fordi de finnes i
runtime.

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| GET | `/api/docs` | OpenAPI-spec (JSON) |
| GET | `/api/docs?ui` | Swagger UI |
| GET | `/api/health` | Helsesjekk for uptime-monitorering |
| GET | `/api/calculations` | Endepunkt-info |
| POST | `/api/calculations` | Beregner energibehov, sol, batteri og reservekraft (krever Bearer-token) |
| GET | `/api/nveid` | Oversikt over tilgjengelige NVEID-endepunkter |
| GET | `/api/nveid/{nveID}` | Meny for én stasjon |
| GET | `/api/nveid/{nveID}/minimum-flow` | Minstevannføring-data |
| GET | `/api/nveid/{nveID}/concession` | NVE-konsesjonslenke |
| GET | `/api/pvgis-tmy` | TMY soldata for koordinater |

### Frontend-hjelpere

Kallbare fra appen, ikke listet i Swagger fordi de er laget for frontend-flyten:

| Metode | Rute | Beskrivelse |
|--------|------|-------------|
| POST | `/api/place-suggestions` | Søker etter sted og adresse i GeoNorge sine stedsnavn- og adresse-API-er |
| POST | `/api/terrain-profile` | Henter høydedata/terrengprofil fra Kartverket |
| POST | `/api/polish-report` | Tar rapportgrunnlag fra frontend og sender jobben videre til `hydroguide-w-r2` |

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

Route patterns i `wrangler.jsonc`. `hydroguide-api` starter bare for URL-er som
matcher disse mønstrene. Andre URL-er på `hydroguide.no` håndteres av
Pages-prosjektet.
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

Pages-deployen får `functions/`-mappen fra `test-deploy/`. I dagens oppsett er
`/api/polish-report` den viktige Pages Function-ruten i produksjon.

Flyten er:

1. Frontend sender rapportgrunnlag til `/api/polish-report`.
2. Pages Function-en validerer tilgangskode og plukker ut feltene AI-en får lov
   til å bruke.
3. Den lager en intern request og kaller `context.env.AI_WORKER.fetch(...)`.
4. Cloudflare sender det kallet til Worker-en `hydroguide-w-r2`.
5. Svaret fra `hydroguide-w-r2` sendes tilbake til frontend.

Bindinger som trengs for `/api/polish-report`:

| Binding | Type | Hva den brukes til |
|---------|------|--------------------|
| `AI_WORKER` | Service binding | internt navn som peker på Worker-en `hydroguide-w-r2` |
| `WORKER_API_KEY` | Secret | Bearer-token sendt fra Pages Function til AI Worker |
| `AI_EXPORT_PASSWORD_HASH` | Secret | validerer eksportkoden før KI-kallet kjøres |

### hydroguide-w-r2 (AI Worker)

Worker for selve KI-jobben. Den tar imot rapportgrunnlaget fra
`/api/polish-report`, henter relevante utdrag fra NVE-korpuset, bygger prompt
med regler fra KV og bruker OpenAI via AI Gateway til å lage teksten som
returneres til frontend. Workers AI brukes til embeddings og enkelte
søk/retrieval-operasjoner, ikke som hovedgenerator i dagens kode.

**Source:** `backend/services/ai/index.ts`
**Config:** `backend/config/wrangler.jsonc`

Bindinger:

| Binding | Type | Resource | Hva den brukes til |
|---------|------|----------|--------------------|
| `AI` | Workers AI | (managed) | embeddings og `env.AI.autorag(...)` |
| `R2_BUCKET` | R2 | bucket `hydroguide-r2` | NVE-korpus med pre-genererte embeddings |
| `PROMPT_KV` | KV | KV-namespace `PROMPT_KV` | prompt, regler, nøkkelord og korte NVE-utdrag |
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
| `PROMPT_KV` | Prompt, regler, nøkkelord og korte NVE-utdrag for rapport-AI |

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
kan koden bruke NVE-utdragene i `PROMPT_KV` og eventuelt Vectorize når det er
aktivert.

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

GitHub deployer begge Worker-ane med `.github/workflows/cloudflare-workers.yml`.
Workflowen les ekte verdiar frå GitHub Secrets, lagar midlertidige
`wrangler.generated.jsonc`-filer og køyrer `wrangler deploy`.

På lokal maskin kan same generering brukast med git-crypt-fila
`backend/config/cloudflare.private.json`:

```bash
node backend/scripts/build-cloudflare-worker-config.mjs --write-deploy-config
cd frontend
npx wrangler deploy --config ../backend/api-worker/wrangler.generated.jsonc
npx wrangler deploy --config ../backend/config/wrangler.generated.jsonc
```

De genererte `wrangler.generated.jsonc`-filene er gitignored. Dei skal ikkje
committast, fordi dei kan innehalde faktiske Cloudflare-ID-ar.

## Konfigurasjon

Wrangler-filer i repo bruker `REPLACE_WITH_*`-plassholdere — det betyr at filen
kan committes til en offentlig repo uten at faktiske Cloudflare-IDer lekker:

- `backend/api-worker/wrangler.jsonc`
- `backend/config/wrangler.jsonc`

Repoet har også `backend/config/cloudflare.public.json`, som viser Worker-oppsett,
ruter, observability og bindingar med sensitive verdiar sett til `OMIT`.

Faktiske ID-ar og token kan ligge i `backend/config/cloudflare.private.json`
(kryptert med git-crypt) for lokal bruk. GitHub Actions bruker GitHub Secrets
med desse namna i staden:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `KV_API_KEYS_NAMESPACE_ID`
- `KV_PROMPT_NAMESPACE_ID`
- `SECRETS_STORE_ID`

Vanlege runtime-hemmeligheiter ligg framleis i Cloudflare Secrets/Secrets Store.
`.dev.vars` er berre lokal utvikling og er gitignored. Mal ligg i
`backend/config/.dev.vars.example`.

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
