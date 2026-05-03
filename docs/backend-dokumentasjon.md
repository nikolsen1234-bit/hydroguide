# Backend-Dokumentasjon

Oppdatert: 2026-05-03

Backend-koden er delt i reine endpoint-handlarar, Worker-entrypoints, intern AI-logikk, berekningslogikk og vedlikehaldsskript.

## Mappestruktur

```text
backend/
  api/                        Delte endpoint-handlarar
    calculations.js           Bereknings-API
    nveid.js                  NVEID og minstevassføring
    docs.js                   OpenAPI og Swagger UI
    health.js                 Helsesjekk
    pvgis-tmy.js              PVGIS-proxy
    place-suggestions.js      Stadsøk for frontend
    terrain-profile.js        Terrengprofil for frontend
    report.js                 Handler brukt av /api/report
  admin/keys/index.js         Handler brukt av /admin/keys
  workers/
    api/index.js              Public API Worker
    report/index.js           Report Worker
    ai/index.ts               Intern AI Worker
    admin/index.js            Admin Worker
  cloudflare/                 Wrangler-konfig for kvar Worker
  services/ai/                Rapport-AI
  services/calculations/      Delt berekningskjerne
  data/                       Lokale datafiler
  scripts/                    Cloudflare, R2 og KV-vedlikehald
```

## Endpoint-Grupper

| Gruppe | Ruter | Merknad |
|--------|-------|---------|
| Offentleg API | `/api/health`, `/api/docs`, `/api/calculations`, `/api/nveid`, `/api/pvgis-tmy` | Dokumentert i `/api/docs?ui` |
| Frontend-hjelparar | `/api/place-suggestions`, `/api/terrain-profile`, `/api/report` | App-interne hjelparar utanfor hovud-API for eksterne brukarar |
| Admin | `/admin/keys` | Eiga Worker-rute med `ADMIN_TOKEN` |
| Intern | `hydroguide-report` -> `hydroguide-ai` | Service binding utan offentleg URL |

## Berekningskjerne

`backend/services/calculations/_calculationCore.js` er rein logikk brukt av både `POST /api/calculations` og frontend. Han validerer input, reknar ut utstyrsbudsjett, batterikapasitet, energibalanse, reservekraft og kostnad over levetid.

## Minstevassføring

`backend/api/nveid.js` les `api/minimumflow.json` frå R2-bindinga `MINIMUM_FLOW_BUCKET`. Lokal kopi ligg i `backend/data/minimumflow.json`.

NVEID-regel:

- `/api/nveid` viser meny.
- `/api/nveid/{nveID}` viser meny for éin stasjon.
- `/api/nveid/{nveID}/minimum-flow` viser minstevassføring.
- `/api/nveid/{nveID}/concession` viser konsesjonslenke.

Rotrutene viser meny og neste moglege API-steg.

## API-Nøklar

`backend/admin/keys/index.js` er kopla til `hydroguide-admin` på `/admin/keys`. Han brukar:

- `API_KEYS` KV
- `ADMIN_TOKEN`
- `API_KEY_HASH_SECRET`

Vanlege kundekall til `/api/calculations` brukar `Authorization: Bearer <api_key>`.

## Vedlikehaldsskript

| Skript | Bruk |
|--------|------|
| `build-cloudflare-worker-config.mjs` | Byggjer og sjekkar generert Cloudflare-konfig |
| `build-ai-search-corpus.mjs` | Byggjer chunks frå NVE-referansar |
| `upload-corpus-to-r2.ps1` | Lastar referansar og embeddings til `hydroguide-ai-reference` |
| `seed-kv.ps1` | Seedar `REPORT_RULES` |
| `fix-r2-metadata.mjs` | Reparerer R2-metadata |

## Cloudflare

Sjå [Cloudflare-dokumentasjon](cloudflare-dokumentasjon.md) for Worker-namn, bindings, lagring og deploy.
