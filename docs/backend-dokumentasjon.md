# Backend-dokumentasjon

Oppdatert: 2026-05-03

## Hva backend gjør

Backend er fire Cloudflare Workers som tar imot HTTP-kall og svarer med JSON eller tekst:

- **`hydroguide-api`** svarer på det offentlige API-et (`/api/*`).
- **`hydroguide-report`** mottar rapport-forespørsler fra nettsiden og kaller AI-en internt.
- **`hydroguide-ai`** lager rapporttekst med en LLM. Har ingen offentlig URL.
- **`hydroguide-admin`** håndterer API-nøkler. Skilt ut for å holde admin-overflaten unna det offentlige API-et.

Tre ressurser deles mellom dem: en KV-namespace for nøkler og rate-limiting (`API_KEYS`), en KV-namespace for rapport-regler (`REPORT_RULES`), og to R2-buckets (`hydroguide-minimum-flow` for NVEID-data, `hydroguide-ai-reference` for AI-referanser).

## Hvor finner jeg hva i koden

```text
backend/
├── workers/                    Worker-entrypoints (én fil per Worker)
│   ├── api/index.js
│   ├── report/index.js
│   ├── ai/index.ts
│   └── admin/index.js
├── api/                        Endpoint-handlere som Workers kaller
│   ├── _apiUtils.js            Felles: auth, rate limit, CORS
│   ├── calculations.js
│   ├── nveid.js
│   ├── docs.js
│   ├── health.js
│   ├── pvgis-tmy.js
│   ├── place-suggestions.js
│   ├── terrain-profile.js
│   └── report.js
├── admin/
│   └── keys/index.js           Handler for /admin/keys
├── services/
│   ├── calculations/           Beregningskjernen (delt mellom frontend og backend)
│   └── ai/                     Rapport-AI (prompt-bygging, retrieval, modell-kall)
├── cloudflare/                 Wrangler-konfig, én per Worker
├── data/
│   ├── minimumflow.json        Lokal kopi av NVEID-data
│   └── cloudflare-kv/          KV seed-filer
└── scripts/                    Vedlikeholds-CLI for Cloudflare, R2, KV
```

## API-en delt opp etter formål

API-et har tre kategorier endepunkter: offentlige endepunkter, frontend-hjelpere og admin-endepunkter.

```mermaid
flowchart TB
    subgraph public[Offentlig API — dokumentert i /api]
        p1[GET /api/health]
        p2[GET /api]
        p3[POST /api/calculations]
        p4[GET /api/NVEID/{id}]
        p5[GET /api/pvgis-tmy]
    end

    subgraph helpers[Frontend-hjelpere — ikke offentlig API]
        h1[POST /api/place-suggestions]
        h2[POST /api/terrain-profile]
        h3[POST /api/report]
    end

    subgraph admin[Admin — egen Worker, /admin/*]
        a1[GET /admin/keys]
        a2[POST /admin/keys]
    end

    subgraph blocked[Blokkert av WAF]
        b1[/api/keys*]
        b2[/rest/*, /api/v1/*]
        b3[secret/source-prober]
    end
```

### Offentlig API (dokumentert i `/api`)

| Endepunkt | Hva det gjør |
|-----------|--------------|
| `GET /api/health` | Helsesjekk. Svarer `{status, timestamp}`. |
| `GET /api` | OpenAPI og Swagger UI. `?openapi` gir OpenAPI-spek. |
| `POST /api/calculations` | Hovedberegning: gitt inntak + utstyr, returnerer energibudsjett, batteristørrelse, kostnad over levetid. |
| `GET /api/calculations` | Returnerer input-skjema. |
| `GET /api/NVEID/{id}` | Offentlig minstevannføring for én stasjon. |
| `GET /api/pvgis-tmy` | Proxy for PVGIS soldata. |

Krever `Authorization: Bearer <api-key>` på alle unntatt `/api/health` og `/api`.

### Frontend-hjelpere

| Endepunkt | Hva det gjør |
|-----------|--------------|
| `POST /api/place-suggestions` | Stedssøk via Kartverket. |
| `POST /api/terrain-profile` | Terrengprofil for radiolink-beregning. |
| `POST /api/report` | Lager AI-rapport. Krever access-code fra nettsiden. |

Disse står ikke i Swagger-spekken.

### Admin

| Endepunkt | Hva det gjør |
|-----------|--------------|
| `GET /admin/keys` | Lister API-nøkler (kun hash). |
| `POST /admin/keys` | Lager ny nøkkel. |
| `DELETE /admin/keys/{id}` | Sletter nøkkel. |

Krever `x-admin-token: <ADMIN_TOKEN>`. WAF blokkerer `/api/keys*`.

## Hvordan beregningene henger sammen

Beregningskjernen i `backend/services/calculations/_calculationCore.js` er ren JavaScript-logikk. Den brukes av to steder:

1. `POST /api/calculations` (Worker-handler i `backend/api/calculations.js`).
2. Frontend, via Vite-bridge i utvikling og direkte import i bygd kode.

Det betyr at beregninger som "hvor mye sol treffer panelet i juni" gir samme svar i UI-en og over API-et. Hvis vi rører kjernen, oppdateres begge automatisk.

## Hvordan rapport-flyten fungerer

```text
Nettsiden                  POST /api/report (access code)
  -> hydroguide-report     validerer access code, sjekker rate limit
       service binding     REPORT_AI_WORKER (intern bearer-token)
  -> hydroguide-ai         henter retrieval-grunnlag fra REPORT_RULES + AI_REFERENCE_BUCKET,
                           bygger prompt, kaller modell via AI Gateway,
                           returnerer rapporttekst med metadata
  -> Nettsiden             rendrer HTML-rapport med AI-tekst + diagrammer
```

`hydroguide-ai` har `workers_dev: false` og ingen route — den er kun nåbar via service binding fra rapport-Worker. Ingen kan kalle AI-en direkte utenfra.

For prompt, retrieval og modellvalg: se [ai-rapport.md](ai-rapport.md) og [ai-strategi.md](ai-strategi.md).

## Hvordan API-nøkler verifiseres

Når et kall kommer inn med `Authorization: Bearer <key>`:

1. Worker tar `<key>`, regner HMAC-SHA-256 med `API_KEY_HASH_SECRET`.
2. Slår opp resultatet i `API_KEYS` KV.
3. Hvis treff og nøkkelen er aktiv: kallet slipper gjennom.
4. Worker oppdaterer rate-limit-telleren for nøkkelen.

KV inneholder kun hash-en, aldri klartekst-nøkkelen. Hvis KV lekkes, kan ingen bruke hash-en til å autentisere — den må reverseres, og det er ikke mulig uten `API_KEY_HASH_SECRET`.

Felles auth-logikk ligger i `backend/api/_apiUtils.js` og brukes av både `hydroguide-api` og `hydroguide-admin`.

## NVEID-rute

`/api/NVEID/{id}` returnerer periodedata direkte for én stasjon.

| Rute | Returnerer |
|------|-------------|
| `/api/NVEID/{id}` | Offentlige periodedata for én stasjon. |

## Vedlikeholdsskript

Skript som kjøres av maintainer ved behov, ikke automatisk i CI:

| Skript | Bruk |
|--------|------|
| `build-cloudflare-worker-config.mjs` | Bygger generert deploy-konfig fra source-config. |
| `check-worker-hygiene.mjs` | Pre-commit/CI-sjekk: konfig-konsistens og branch-status. |
| `build-ai-search-corpus.mjs` | Bygger AI-Search-chunks fra NVE-referanser. |
| `upload-corpus-to-r2.ps1` | Laster opp referanser/embeddings til `AI_REFERENCE_BUCKET`. |
| `seed-kv.ps1` | Seeder `REPORT_RULES` KV. |
| `fix-r2-metadata.mjs` | Reparerer R2-metadata ved behov. |

## Testing

| Test | Hva den dekker |
|------|----------------|
| `backend/api/_apiUtils.test.mjs` | Auth + rate limit |
| `backend/api/nveid.test.mjs` | NVEID-oppslag |
| `backend/api/pvgis-tmy.test.mjs` | PVGIS proxy-feilhåndtering |
| `backend/cloudflare/wrangler-routes.test.mjs` | Rute-mønster i Wrangler-config matcher kontrakt |

Kjør med `node --test backend/api/<navn>.test.mjs`.

## Se også

- Worker-konfig, deploy, secrets: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Trusselbilde og auth-design: [sikkerheit.md](sikkerheit.md)
- Rapport-AI (runtime): [ai-rapport.md](ai-rapport.md)
- Rapport-AI (strategi): [ai-strategi.md](ai-strategi.md)
- Lokal utvikling: [utvikling.md](utvikling.md)
