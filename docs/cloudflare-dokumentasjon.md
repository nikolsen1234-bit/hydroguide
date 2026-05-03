# HydroGuide Cloudflare-Dokumentasjon

Oppdatert: 2026-05-03

## Kort Forklart

Cloudflare-løysinga er delt i statisk frontend, fire Workers, to KV namespaces og tre R2 buckets. Nettsida kallar berre rutene ho treng, medan rapport-AI, API-nøklar og admin-logikk ligg bak eigne grenser.

```text
Nettlesar
  -> statisk frontend                 React/Vite-app
  -> hydroguide-api                   offentleg API + enkle frontend-hjelparar
  -> hydroguide-report                rapportinngang for nettsida
       -> REPORT_AI_WORKER            intern service binding
            -> hydroguide-ai          AI, retrieval og rapporttekst

Admin
  -> hydroguide-admin                 /admin/*, aldri blanda med /api/*
```

Cloudflare WAF avviser API-prefix utanfor kontrakten, kjeldeprobar og sensitive filstiar som `/rest/*`, `/api/v1/*`, `/api/keys*`, `.env`, `.secrets`, `/.git*`, `/.ai*`, `/backend*` og `/node_modules*`.

## Kva Nettsida Kallar Direkte

| Rute | Worker | Bruk |
|------|--------|------|
| `/api/health` | `hydroguide-api` | Enkel helsesjekk |
| `/api/docs` | `hydroguide-api` | OpenAPI og Swagger UI |
| `/api/calculations` | `hydroguide-api` | Offentleg bereknings-API |
| `/api/nveid` | `hydroguide-api` | NVEID-meny og minstevassføring |
| `/api/pvgis-tmy` | `hydroguide-api` | PVGIS TMY-proxy |
| `/api/place-suggestions` | `hydroguide-api` | Stadsøk for appen |
| `/api/terrain-profile` | `hydroguide-api` | Terrengprofil for appen |
| `/api/report` | `hydroguide-report` | AI-tekst til rapporten |

WAF avviser `/api/keys*`. Admin for API-nøklar ligg på `/admin/keys`.

`/api/place-suggestions`, `/api/terrain-profile` og `/api/report` er frontend-hjelparar. Dei er kallbare frå nettsida og ligg utanfor hovud-API for eksterne brukarar.

## Workers

| Worker | Config | Source | Bindingar |
|--------|--------|--------|-----------|
| `hydroguide-api` | `backend/cloudflare/api.wrangler.jsonc` | `backend/workers/api/index.js` | `MINIMUM_FLOW_BUCKET`, `API_KEYS`, `API_KEY_HASH_SECRET` |
| `hydroguide-report` | `backend/cloudflare/report.wrangler.jsonc` | `backend/workers/report/index.js` | `REPORT_AI_WORKER`, `REPORT_ACCESS_CODE_HASH`, `REPORT_WORKER_TOKEN` |
| `hydroguide-ai` | `backend/cloudflare/ai.wrangler.jsonc` | `backend/workers/ai/index.ts` | `AI`, `REPORT_RULES`, `AI_REFERENCE_BUCKET`, `REPORT_WORKER_TOKEN`, AI Gateway/Search secrets |
| `hydroguide-admin` | `backend/cloudflare/admin.wrangler.jsonc` | `backend/workers/admin/index.js` | `API_KEYS`, `ADMIN_TOKEN`, `API_KEY_HASH_SECRET` |

Alle Workers har `workers_dev: false`. Det hindrar ein ekstra `*.workers.dev`-inngang som kan gå utanom sone-reglar på `hydroguide.no`.

## Lagring

| Type | Namn | Bruk |
|------|------|------|
| R2 | `hydroguide-minimum-flow` | `api/minimumflow.json` for `/api/nveid` |
| R2 | `hydroguide-ai-reference` | NVE-referansar og embeddings for rapport-AI |
| R2 | `hydroguide-assets` | Offentlege filer under `files.hydroguide.no` |
| KV | `API_KEYS` | API-nøklar, status og rate limit |
| KV | `REPORT_RULES` | Rapportreglar, faste utdrag og retrieval-støtte |

## Hemmelege Verdiar

Desse ligg som Cloudflare secrets, Cloudflare Secrets Store eller GitHub Actions secrets:

- `API_KEY_HASH_SECRET`
- `REPORT_ACCESS_CODE_HASH`
- `REPORT_WORKER_TOKEN`
- `AI_GATEWAY_AUTH_TOKEN`
- `AI_SEARCH_API_TOKEN`
- `ADMIN_TOKEN`

`CLOUDFLARE_API_TOKEN` og `CLOUDFLARE_API_TOKEN_ID` ligg i Cloudflare Secrets Store og i lokal `.secrets` som backup. Aktiv driftstoken er ein smal HydroGuide Cloudflare ops-token.

## Deploy-Konfig

Kjeldekonfig ligg i `backend/cloudflare/*.wrangler.jsonc`. Desse filene har bevisst placeholder-ID-ar.

Genererte deploy-konfigar ligg som `backend/cloudflare/*.generated.wrangler.jsonc` og er gitignored. Scriptet lagar dei:

```bash
node backend/scripts/build-cloudflare-worker-config.mjs --write-public
node backend/scripts/build-cloudflare-worker-config.mjs --write-deploy-config
```

Sjekk at offentleg metadata og deploy-konfig er konsistente:

```bash
node backend/scripts/build-cloudflare-worker-config.mjs --check-public
node backend/scripts/build-cloudflare-worker-config.mjs --check-deploy-config
```

GitHub Actions deployar i denne rekkefølgja:

1. `hydroguide-ai`
2. `hydroguide-api`
3. `hydroguide-report`
4. `hydroguide-admin`

## Sikkerheitsreglar

- Admin-ruter ligg under `/admin/*`.
- WAF avviser `/api/keys*`. Adminoperasjonar går gjennom `/admin/keys`.
- Rapport-AI har ingen offentleg route. `hydroguide-report` kallar han med `REPORT_AI_WORKER`.
- Rapportkall brukar `REPORT_ACCESS_CODE_HASH` frå nettsida og `REPORT_WORKER_TOKEN` internt.
- API-nøklar ligg i KV som hash/HMAC.
- R2-bucket for minstevassføring er skild frå R2-bucket for AI-referansar.
- Tracked config brukar placeholders for account IDs, namespace IDs og tokens.

Aktive Cloudflare-reglar:

- SSL/TLS: `strict`, Always Use HTTPS på, Automatic HTTPS Rewrites på, TLS 1.3 på, minimum TLS 1.2.
- DNSSEC: aktiv.
- WAF custom rules: avviser API-prefix utanfor kontrakten, kjelde-/secret-probes, `TRACE`/`TRACK`, og feil metodar mot admin.
- Managed WAF: Cloudflare Managed Free Ruleset er aktiv.
- Rate limit: `/api/*` og `/admin/*` er avgrensa til plan-tillaten regel, 40 requests per 10 sekund per IP/datacenter med 10 sekund blokk.
- Response headers: Cloudflare set `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` og `Permissions-Policy`.
- Cache rules: Cloudflare bypassar cache for `/api/*` og `/admin/*`; statisk frontend og R2-assets er utanfor denne API/admin-bypassregelen.

## Tokenhygiene

- Cloudflare secrets er primær kjelde for drift. Lokal `.secrets` er backup med same verdiar.
- Den aktive Cloudflare ops-tokenen har HydroGuide-relevante rettar for Workers, routes, KV, R2, Secrets Store, zone settings, WAF, transform rules, cache rules, DNS og SSL.
- Tokenar som blir limte inn i chat eller brukt utanfor normal drift blir roterte etter bruk.
