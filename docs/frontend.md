# Frontend-dokumentasjon

Oppdatert: 2026-04-29

React/Vite SPA på Cloudflare Pages. TypeScript, Tailwind CSS, Leaflet for kart.

---

## Sider

| Side | Rute | Beskrivelse |
|------|------|-------------|
| `WelcomePage` | `/` | Landingsside |
| `MainPage` | `/system` | Spørsmålsbasert wizard (Q1–Q9) for klassifisering av inntak |
| `SystemPage` | `/system/results` | Systemkonfigurasjon: sol, batteri, backup, utstyrslast |
| `AnalysisPage` | `/analysis` | Detaljert energianalyse med timesoppløsning og pålitelighet |
| `BudgetPage` | `/budget` | Utstyrsbudsjett — effekt og energiforbruk per enhet |
| `OverviewPage` | `/overview` | Sammendrag av konfigurasjon |
| `SiktlinjeRadioPage` | `/siktlinje` | Radiolink-beregning med Fresnel-sone og terrengprofil |
| `ApiPage` | `/api` | Swagger UI iframe (`/api/docs?ui`) |

---

## Spørsmål og anbefaling (Q1–Q9)

Brukeren svarer på 9 spørsmål om inntaket (anleggstype, vannføring, slippmetode, sediment/is, fiskepassasje, bypass, måleprofil, kontroll). Basert på svarene klassifiserer `recommendation.ts` anlegget og anbefaler hovedløsning, kontrollmetode og konfidensgrad.

Vannføringsgrenser: liten ≤30 l/s, middels ≤120 l/s, stor >120 l/s.

---

## Beregninger

### Moduser

| Modus | Beskrivelse |
|-------|-------------|
| Standard | Månedlig modell, ingen eksterne kall |
| Detaljert | Timesberegning med PVGIS-data, batterisimulering, pålitelighetsanalyse |

### Solstråling (solarEngine.ts)

TypeScript-port av PVGIS 6.0 (EUPL-1.2). Kjører i nettleseren. Beregner timesvis GTI (Global Tilted Irradiance) for hele året med solposisjon, horisontskygge, AOI-tap, modultemperatur og PV-effektivitet.

Henter klimadata (GHI, DHI, temperatur, vind) fra EU JRC PVGIS 5.3 via `metClient.ts`.

### Horisontprofil (horizonProfile.ts)

Henter terrengdata fra Kartverkets 1m DTM direkte fra nettleseren. 360 retninger × 40 avstander. Brukes av solmotoren for å beregne skyggetap gjennom dagen.

### Batterisimulering (batterySimulator.ts)

Simulerer 8760 timer SOC (state of charge) for off-grid sol+batteri. Tracker underskudd, overskudd, backup-bruk (brenselcelle/diesel) og drivstofforbruk.

### Energibalanse (systemResults.ts)

Summerer utstyrsbudsjett (Wh/dag), beregner batterikapasitet, månedlig sol vs. last, årstotaler (kWh, drivstoff, CO₂) og TCO-sammenligning mellom backup-kilder.

### Radiolink (radioLink.ts)

Siktlinje- og Fresnel-sone-beregning mellom to punkter for trådløs telemetri. Henter terrengprofil fra Kartverket.

---

## Standalone-kart

**nve-kart-standalone.html** — vannkraftverk med minstevannføring-data, Wikipedia-bilder, konsesjonslenker (Leaflet + NVE ArcGIS)

**solar-location-map.html** — lokasjonspicker, kommuniserer med React via `postMessage`

---

## Rapport

`report.ts` genererer HTML-rapport med søylediagram, kostnadssammenligninger, anbefalinger og KI-polert tekst fra `/api/polish-report`.

---

## Build

```bash
cd frontend
npm install          # dependencies + git hooks
npm run dev          # Vite dev server (localhost:5173)
npm run build:test   # build + kopier til test-deploy/
```
