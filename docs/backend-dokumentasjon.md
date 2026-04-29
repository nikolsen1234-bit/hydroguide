# Backend-dokumentasjon

Oppdatert: 2026-04-29

---

## Mappestruktur

```
backend/
├── api/                      API-handlers
│   ├── calculations.js       Energiberegning (Bearer-auth, rate-limited)
│   ├── nveid.js              Minstevannføring per NVEID (R2-backed)
│   ├── docs.js               OpenAPI-spec og Swagger UI
│   ├── health.js             Helsesjekk
│   ├── pvgis-tmy.js          Proxy til EU PVGIS
│   ├── place-suggestions.js  Proxy til Geonorge
│   ├── terrain-profile.js    Proxy til Kartverket
│   ├── polish-report.js      KI-rapport-proxy til AI Worker
│   ├── keys/index.js         API-nøkkeladministrasjon
│   ├── _apiUtils.js          Delt auth og response-logikk
│   ├── _constants.js         Konfigurasjonskonstanter
│   └── _edgeUtils.js         KV/cache-utilities
├── api-worker/               Selvstendig Worker for /api/*
│   ├── index.js              Router
│   └── wrangler.jsonc        Route patterns og bindings
├── services/
│   ├── ai/                   AI Worker — se ai-dokumentasjon.md
│   └── calculations/
│       └── _calculationCore.js
├── config/                   Wrangler-konfig for AI Worker
├── data/
│   ├── minimumflow.json      Generert av minstevannføring-pipeline
│   └── cloudflare-kv/        KV seed-data
├── scripts/                  Vedlikeholdsskript
└── _middleware.js             CSP, CORS, feilhåndtering
```

---

## Beregningskjerne (_calculationCore.js)

Delt beregningslogikk brukt av både `POST /api/calculations` og frontend:

- Normaliserer og validerer input (typekonvertering, grensekontroll)
- Beregner utstyrsbudsjett, batterikapasitet, månedlig energibalanse
- Beregner årstotaler: kWh sol, kWh last, underskudd, drivstoff, CO₂
- TCO-sammenligning mellom backup-kilder over evalueringshorisont
- Ren funksjon — ingen sideeffekter, ingen nettverkskall

---

## API-endepunkter

### Beregning (`calculations.js`)

- `POST /api/calculations` — tar inn PlantConfiguration JSON, returnerer komplett beregningsresultat
- Bearer-token auth via `API_KEYS` KV
- Rate-limited per API-nøkkel
- `GET` returnerer endepunkt-dokumentasjon

### Minstevannføring (`nveid.js`)

- `GET /api/nveid` — oversikt over tilgjengelige endepunkter
- `GET /api/nveid/{nveID}` — meny for én stasjon
- `GET /api/nveid/{nveID}/minimum-flow` — minstevannføring-data
- `GET /api/nveid/{nveID}/concession` — NVE konsesjonslenke
- Leser `minimumflow.json` fra R2 (`hydroguide-api-data`)
- Caching: 1t for funnet data, 5min for ikke-funnet

### Proxyer

Disse endepunktene proxyer forespørsler til tredjepart — frontenden kaller vår backend istedenfor å snakke direkte med tjenestene (CORS, rate-limiting, feilhåndtering):

| Endepunkt | Tredjepart | Data |
|-----------|------------|------|
| `/api/pvgis-tmy` | EU JRC PVGIS | TMY soldata for koordinater |
| `/api/place-suggestions` | Geonorge | Stedsnavn-autocomplete |
| `/api/terrain-profile` | Kartverket | Terrengprofil fra 1m DTM |
| `/api/polish-report` | AI Worker (intern) | KI-generert rapporttekst |

### Swagger (`docs.js`)

`GET /api/docs` serverer OpenAPI 3.0-spec med schemas for alle request/response-typer. `GET /api/docs?ui` rendrer Swagger UI med inline-script (egen CSP med nonce).

---

## Data

### minimumflow.json

Generert av minstevannføring-pipelinen. ~1500 vannkraftverk med minstevannføringskrav per NVEID. Se [AI-dokumentasjon](ai-dokumentasjon.md) for hvordan dataen produseres.

Filen lastes opp til R2 og serveres derfra. Lokal kopi i `backend/data/` brukes under utvikling.

### KV seed-data

`cloudflare-kv/kv-seed.json` — initiell data for KV-namespaces. Brukes av `seed-kv.ps1` ved oppsett.

---

## Vedlikeholdsskript

| Skript | Hva det gjør |
|--------|-------------|
| `build-ai-search-corpus.mjs` | Parser NVE-veiledere til chunks med metadata og topic-tags |
| `upload-corpus-to-r2.ps1` | Laster opp chunks til R2 med embeddings |
| `seed-kv.ps1` | Skriver bucketert evidens til PROMPT_KV |
| `fix-r2-metadata.mjs` | Reparerer content-type og custom metadata i R2 |

Kjøres manuelt ved korpus-oppdateringer eller oppsett av ny Cloudflare-konto.

---

## PDF-generatorer

To lokale Python-skript som lager PDF-rapporter:

| Skript | Output |
|--------|--------|
| `tools/horizon_pdf.py` | Horisontprofil med 360° panorama, solbaner (sommer/vinter/jevndøgn), terrengsilhuett fra Kartverket |
| `tools/solar_position_pdf.py` | Solposisjon gjennom dagen: altitude, azimut, innfallsvinkel med terrengskygge |

Begge bruker NOAA-algoritmer og Kartverket DTM for terreng. ReportLab for PDF-output. Kjøres lokalt, ikke del av deploy.

---

## Middleware (_middleware.js)

Kjører på alle Pages-ruter:

- CSP per rute-type (SPA, Swagger, standalone-kart)
- Feilhåndtering med generiske meldinger
- CORS-headers for API-ruter
