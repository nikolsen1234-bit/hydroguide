# HydroGuide Cloudflare-Dokumentasjon

Oppdatert: 2026-05-03

## Kort Forklart

Cloudflare-oppsettet er delt i Pages, fire Workers, to KV namespaces og tre R2 buckets. Poenget er at nettsida berre kallar rutene ho treng, medan rapport-AI, API-noklar og admin-logikk ligg bak eigne grenser.

```text
Nettlesar
  -> Cloudflare Pages                 statisk React/Vite-app
  -> hydroguide-api                   offentleg API + enkle frontend-hjelparar
  -> hydroguide-report                rapportinngang for nettsida
       -> REPORT_AI_WORKER            intern service binding
            -> hydroguide-ai          KI, retrieval og rapporttekst

Admin
  -> hydroguide-admin                 /admin/*, aldri blanda med /api/*
```

Cloudflare WAF blokkerer gamle og sensitive inngangar som `/rest/*`, `/api/v1/*`, `/api/keys*`, `/api/polish-report*`, `.env`, `.secrets`, `/.git*`, `/.ai*`, `/backend*` og `/node_modules*`.

## Kva Nettsida Kallar Direkte

| Rute | Worker | Bruk |
|------|--------|------|
| `/api/health` | `hydroguide-api` | Enkel helsesjekk |
| `/api/docs` | `hydroguide-api` | OpenAPI og Swagger UI |
| `/api/calculations` | `hydroguide-api` | Offentleg bereknings-API |
| `/api/nveid` | `hydroguide-api` | NVEID-meny og minstevassforing |
| `/api/pvgis-tmy` | `hydroguide-api` | PVGIS TMY-proxy |
| `/api/place-suggestions` | `hydroguide-api` | Stadssok for appen |
| `/api/terrain-profile` | `hydroguide-api` | Terrengprofil for appen |
| `/api/report` | `hydroguide-report` | KI-tekst til rapporten |

`/api/keys*` er ikkje ei public Worker-rute. Den blir blokkert av Cloudflare WAF. Admin for API-noklar ligg på `/admin/keys`.

`/api/place-suggestions`, `/api/terrain-profile` og `/api/report` er frontend-hjelparar. Dei skal vere kallbare frå nettsida, men dei skal ikkje presenterast som hovud-API for eksterne brukarar.

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
| KV | `API_KEYS` | API-noklar, status og rate limit |
| KV | `REPORT_RULES` | Rapportreglar, faste utdrag og retrieval-stotte |

## Hemmelege Verdiar

Desse skal vere Cloudflare secrets, Cloudflare Secrets Store eller GitHub Actions secrets, ikkje vanlege `vars`:

- `API_KEY_HASH_SECRET`
- `REPORT_ACCESS_CODE_HASH`
- `REPORT_WORKER_TOKEN`
- `AI_GATEWAY_AUTH_TOKEN`
- `AI_SEARCH_API_TOKEN`
- `ADMIN_TOKEN`

`CLOUDFLARE_API_TOKEN` og `CLOUDFLARE_API_TOKEN_ID` ligg i Cloudflare Secrets Store og i lokal `.secrets` som backup. Aktiv driftstoken er ein smal HydroGuide Cloudflare ops-token. Den breie midlertidige tokenen frå oppsettet er sletta.

## Deploy-Konfig

Kjeldekonfig ligg i `backend/cloudflare/*.wrangler.jsonc`. Desse filene har bevisst placeholder-ID-ar.

Genererte deploy-konfigar ligg som `backend/cloudflare/*.generated.wrangler.jsonc` og er gitignored. Dei blir laga av:

```bash
node backend/scripts/build-cloudflare-worker-config.mjs --write-public
```

Sjekk at `backend/config/cloudflare.public.json` er oppdatert:

```bash
node backend/scripts/build-cloudflare-worker-config.mjs --check-public
```

GitHub Actions deployar i denne rekkefolgja:

1. `hydroguide-ai`
2. `hydroguide-api`
3. `hydroguide-report`
4. `hydroguide-admin`

## Sikkerheitsreglar

- Admin-ruter ligg under `/admin/*`, ikkje under vanleg `/api/*`.
- `/api/keys*` er ikkje rutet til admin Worker. Rutelaget og WAF-laget skal halde admin utanfor public API.
- Rapport-AI er ikkje offentleg rutet. `hydroguide-report` kallar han med `REPORT_AI_WORKER`.
- Rapportkall krev `REPORT_ACCESS_CODE_HASH` frå nettsida og `REPORT_WORKER_TOKEN` internt.
- API-noklar blir lagra i KV som hash/HMAC, ikkje som klartekst.
- R2-bucket for minstevassforing er skild frå R2-bucket for AI-referansar.
- Real account IDs, namespace IDs og tokens skal ikkje inn i tracked config.

Aktive Cloudflare-reglar:

- SSL/TLS: `strict`, Always Use HTTPS på, Automatic HTTPS Rewrites på, TLS 1.3 på, minimum TLS 1.2.
- DNSSEC: aktiv.
- WAF custom rules: blokkerer gamle API-ruter, kjelde-/secret-probes, `TRACE`/`TRACK`, og feil metodar mot admin.
- Managed WAF: Cloudflare Managed Free Ruleset er aktiv.
- Rate limit: `/api/*` og `/admin/*` er avgrensa til plan-tillaten regel, 40 requests per 10 sekund per IP/datacenter med 10 sekund blokk.
- Response headers: Cloudflare set `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` og `Permissions-Policy`.
- Cache rules: Cloudflare bypassar cache for `/api/*` og `/admin/*`; statisk Pages-innhald og R2-assets blir ikkje endra av denne regelen.
- Pages: `hydroguide` brukar ikkje Pages Functions og har ikkje KV-bindingar.

## Tokenhygiene

- Cloudflare secrets er primær kjelde for drift. Lokal `.secrets` er backup med same verdiar.
- Den aktive Cloudflare ops-tokenen skal ha berre HydroGuide-relevante rettar for Workers, routes, KV, R2, Pages, Secrets Store, zone settings, WAF, transform rules, cache rules, DNS og SSL.
- Tokenar som blir limte inn i chat eller brukt midlertidig skal roterast eller slettast etter bruk.
- `hydroguide-pipeline` kan berre slettast når det er stadfesta at deploy/pipeline ikkje brukar han.
