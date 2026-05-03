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

Alle Workers har `workers_dev: false`. Det hindrar ein ekstra `*.workers.dev`-inngang som kan gå utanom sone-reglar på `hydroguide.no`. Alle har òg `observability.enabled: true` med full sampling, slik at runtime-loggar kan lesast i Cloudflare-dashbordet.

## Lagring

| Type | Namn | Bruk |
|------|------|------|
| R2 | `hydroguide-minimum-flow` | `api/minimumflow.json` for `/api/nveid` |
| R2 | `hydroguide-ai-reference` | NVE-referansar og embeddings for rapport-AI |
| R2 | `hydroguide-assets` | Offentlege filer under `files.hydroguide.no` |
| KV | `API_KEYS` | API-nøklar, status og rate limit |
| KV | `REPORT_RULES` | Rapportreglar, faste utdrag og retrieval-støtte |

## Hemmelege Verdiar

Desse ligg som Cloudflare secrets, Cloudflare Secrets Store eller Cloudflare Workers Builds secrets:

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

Worker-endringar skal starte frå oppdatert `main`, på eigen branch. For commit eller PR skal denne sjekken passere:

```bash
node backend/scripts/check-worker-hygiene.mjs --staged
```

Sjekken køyrer offentleg config-validering, deploy-config-validering når private verdiar finst lokalt, stoppar `*.generated.wrangler.jsonc` og private Cloudflare deploy-filer frå vanleg commit, og blokkerer staged Worker-endringar dersom branch er bak upstream. CI køyrer same sjekk med `--all --ci`.

## Deploy-Flyt

Cloudflare Workers Builds er Git-kopla deploy for Workers. GitHub Actions deployar ikkje Workers og skal ikkje ha `CLOUDFLARE_API_TOKEN`.

```text
utviklar       GitHub                 Cloudflare Workers Builds         prod
   |             |                              |                          |
   | git push -> |                              |                          |
   |             | webhook --> Workers Builds   |                          |
   |             |                              | npm ci                   |
   |             |                              | build deploy-config      |
   |             |                              | wrangler deploy   ---->  |
   |             |                              | (per Worker)             |
```

Kvar Worker er kopla til GitHub-repoet `nikolsen1234-bit/hydroguide` i Cloudflare:

| Worker | Root directory | Build command | Deploy command |
|--------|----------------|---------------|----------------|
| `hydroguide-ai` | `frontend` | `npm ci && node ../backend/scripts/build-cloudflare-worker-config.mjs --check-public --write-deploy-config` | `npx wrangler deploy --config ../backend/cloudflare/ai.generated.wrangler.jsonc` |
| `hydroguide-api` | `frontend` | `npm ci && node ../backend/scripts/build-cloudflare-worker-config.mjs --check-public --write-deploy-config` | `npx wrangler deploy --config ../backend/cloudflare/api.generated.wrangler.jsonc` |
| `hydroguide-report` | `frontend` | `npm ci && node ../backend/scripts/build-cloudflare-worker-config.mjs --check-public --write-deploy-config` | `npx wrangler deploy --config ../backend/cloudflare/report.generated.wrangler.jsonc` |
| `hydroguide-admin` | `frontend` | `npm ci && node ../backend/scripts/build-cloudflare-worker-config.mjs --check-public --write-deploy-config` | `npx wrangler deploy --config ../backend/cloudflare/admin.generated.wrangler.jsonc` |

Cloudflare Workers Builds har desse build-verdiane på Cloudflare-sida:

- `CLOUDFLARE_ACCOUNT_ID`
- `KV_API_KEYS_NAMESPACE_ID`
- `KV_REPORT_RULES_NAMESPACE_ID`

Cloudflare sin Workers Builds API token handterer deploy-kallet. Lokal `.secrets` er backup for manuell drift og lokal verifisering.

Deploy-rekkefølgja er:

1. `hydroguide-ai`
2. `hydroguide-api`
3. `hydroguide-report`
4. `hydroguide-admin`

`hydroguide-ai` blir deploya først fordi `hydroguide-report` har ein service binding til han. Bindinga peikar på namnet `hydroguide-ai`, så Worker-en må eksistere før report-deployen kan lykkast første gong.

## Rollback

Cloudflare Workers Builds held tilgjengeleg fleire versjonar av kvar Worker. Rollback skjer på Cloudflare-dashbordet under "Deployments" for den aktuelle Workeren — vel ein annan deploy og aktiver han. Same rollback kan òg gjerast lokalt med:

```bash
cd frontend
npx wrangler rollback --name hydroguide-api
```

For ein dårleg konfig-endring som ikkje er deploya enda: rev commit på `main`, push på nytt, så bygger Workers Builds ein ny deploy med den førre konfigen.

## Observability

| Kjelde | Bruk |
|--------|------|
| Cloudflare Dashboard → Workers → `<worker>` → Logs | Live-loggar med `head_sampling_rate: 1` |
| `npx wrangler tail --name <worker>` | Live-loggstream lokalt |
| Cloudflare Dashboard → Workers Builds | Bygg- og deploy-historikk per Worker |
| Cloudflare Dashboard → Analytics → Security | WAF-treff, rate limit-treff, blokkerte requests |
| Cloudflare Dashboard → AI → AI Gateway | Cache-treff, kostnad og latens for rapport-AI |

Alle fire Workers har `observability.enabled: true`. Det betyr at alle requests blir logga med headerar, status og runtime-feil utan ekstra kode i kvar Worker.

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

## Sjå Òg

- Sikkerhetsmodell og trusselbilete: [sikkerheit.md](sikkerheit.md)
- Arkitektur og dataflyt: [arkitektur.md](arkitektur.md)
- Lokal utvikling og bygg: [utvikling.md](utvikling.md)
- Backend-kode og endepunkt: [backend-dokumentasjon.md](backend-dokumentasjon.md)
- Rapport-AI: [ai-rapport.md](ai-rapport.md)
