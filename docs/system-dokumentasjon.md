# HydroGuide systemdokumentasjon

Oppdatert: 2026-04-29

## Oversikt

- `<deploy-folder>` er den einaste deploy-mappa.
- `frontend/` er arbeidskjelda for bygging av deploy-pakka.
- Deploy-pakka skal berre innehalde runtime-filer som er naudsynte for at Cloudflare-løysinga skal fungere.
- All offentleg API ligg under `/api/*`. `/rest/*` og `/api/v1/*` er ikkje støtta.

## Innhald i deploy-mappa

Deploy-mappa blir bygd av `npm run build:test` og inneheld:

- alt frå `dist/` i rota av `test`
- ei kuratert `functions/`-mappe med berre rutene og hjelparane som den publiserte løysinga treng

Det betyr at deploy-mappa skal ha:

- `index.html`
- `build-info.json`
- `_headers`
- `Kalkulator.txt`
- `HydroGuide.txt`
- `PVGIS_6.0_HydroGuide_Beta.txt`
- `nve-kart-standalone.html`
- `solar-location-map.html`
- `assets/`
- `functions/_middleware.js`
- `functions/services/calculations/_calculationCore.js`
- `functions/api/_apiUtils.js`
- `functions/api/_constants.js`
- `functions/api/_edgeUtils.js`
- `functions/api/calculations.js`
- `functions/api/docs.js`
- `functions/api/health.js`
- `functions/api/keys/index.js`
- `functions/api/nveid.js`
- `functions/api/place-suggestions.js`
- `functions/api/polish-report.js`
- `functions/api/pvgis-tmy.js`
- `functions/api/terrain-profile.js`

Det skal ikkje liggje dokumentasjon, rapportar, skjermbilete, lokale hjelpefiler eller andre ikkje-runtime artefakt i `test`.

## Endepunkt som skal fungere

Desse rutene er del av deploy-pakka:

Offentleg API (dokumentert i `/api/docs?ui`):

- `GET /api/docs`
- `GET /api/docs?ui`
- `GET /api/health` (uptime-sjekk)
- `GET /api/calculations`
- `POST /api/calculations`
- `GET /api/nveid`
- `GET /api/nveid/{nveID}`
- `GET /api/nveid/{nveID}/minimum-flow`
- `GET /api/nveid/{nveID}/concession`
- `GET /api/pvgis-tmy`

Frontend-hjelparar (callable av appen, ikkje offentleg dokumentert):

- `POST /api/place-suggestions`
- `POST /api/polish-report`
- `POST /api/terrain-profile`

Admin-API:

- `GET /api/keys`
- `POST /api/keys`

Admin-API-et under `/api/keys` er framleis deploya, men skal ikkje vere offentleg dokumentert eller lenka frå UI.

## Cloudflare bindings

Runtime krev desse bindingane:

- `API_KEYS` for bereknings-API og admin-api
- `AI_WORKER` for KI-proxyen
- `WORKER_API_KEY` for auth mot AI-worker
- `AI_EXPORT_PASSWORD_HASH` for eksportkode i KI-flyten
- `INTERNAL_SERVICE_TOKEN` for admin-token

## Bygg og pakking

Bruk:

```bash
npm run build:test
```

Dette:

1. byggjer frontend
2. oppdaterer `dist/build-info.json`
3. nullstiller `<deploy-folder>`
4. kopierer inn `dist`
5. kopierer inn berre den kuraterte `functions/`-mengda

## KI-laget

KI-flyten i den deploya losinga er:

1. frontend byggjer payload fra recommendation og derived results
2. brukar sender eksportkode
3. frontend postar til `/api/polish-report`
4. `polish-report` validerer input og sender vidare til `AI_WORKER`
5. AI-worker returnerer `{ text: "..." }`
6. frontend viser rapporten

## Berekningslaget

`functions/services/calculations/_calculationCore.js` er delt runtime-logikk for:

- inputnormalisering
- validering
- deterministiske berekningar
- svargrunnlag for `POST /api/calculations`
