# Frontend-dokumentasjon

Oppdatert: 2026-05-02

React/Vite-app på Cloudflare Pages. TypeScript, Tailwind for utforming, Leaflet for kart.

---

## Sider

| Side | Rute | Beskrivelse |
|------|------|-------------|
| `WelcomePage` | `/` | Landingsside og modusvelger (rask / detaljert / kombinert) |
| `OverviewPage` | `/oversikt` | Sammendrag av konfigurasjon |
| `MainPage` | `/parametere` | Spørsmål Q1–Q9 om inntaket. Hoppes over i rask modus |
| `SystemPage` | `/system` | Sol, batteri, reservekraft og utstyrslast |
| `BudgetPage` | `/effektbudsjett` | Utstyrsbudsjett — effekt og forbruk per enhet |
| `AnalysisPage` | `/analyse` | Energianalyse time for time, med pålitelighet og tilrådning |
| `SiktlinjeRadioPage` | `/siktlinje-radio` | Siktlinje og Fresnel-sone for radiolink |
| `DocumentationPage` | `/dokumentasjon` | Teknisk bakgrunn med formler |
| `ContactPage` | `/kontakt` | Prosjektgruppe og kontaktinformasjon |
| `ApiPage` | `/api` | Innebygd visning av det offentlege API-et |

---

## Spørsmål og anbefaling (Q1–Q9)

Brukaren svarer på 9 spørsmål om inntaket. Ut frå svara foreslår appen ei hovudløysing for slipp og måling, med ein kort grunngjeving og eventuelle tilleggskrav. Logikken ligg i `recommendation.ts`.

Vassføringsgrenser: liten ≤30 l/s, middels ≤120 l/s, stor >120 l/s.

---

## Beregninger

### Moduser

| Modus | Beskrivelse |
|-------|-------------|
| Rask | Forenkla månedlig modell. Ingen henting av data utanfrå |
| Detaljert | Timesvis simulering med soldata, batteri og pålitelighetsanalyse |
| Kombinert | Forenkla oversikt + detaljert pålitelighetsanalyse |

### Solstråling

Reknar ut kor mykje sol som treffer panelet kvar time gjennom året, og tek omsyn til solposisjon, skygge frå horisonten, vinkelen sola treff panelet med, modultemperatur og verkningsgrad. Klimadata (sol, temperatur, vind) hentes frå EU sitt PVGIS-arkiv.

Implementert i `solarEngine.ts` som ein TypeScript-port av PVGIS 6.0, med data via `metClient.ts` (proxy `/api/pvgis-tmy`).

### Horisontprofil

Hentar høgdedata for terrenget rundt staden direkte frå Kartverket, og brukar dei til å rekne ut når sola står bak ein åskam og skuggar panelet.

Implementert i `horizonProfile.ts`. Samplar 360 retninger × 40 avstander frå Kartverkets 1m-terrengmodell.

### Batterisimulering

Simulerer batteriet eit heilt år, time for time. Held rekneskap med kor mykje straum som vert lagra og brukt, kor ofte batteriet går tomt, kor mykje reservekraft (brenselcelle eller diesel) må gå inn, og kor mykje drivstoff det kostar.

Implementert i `batterySimulator.ts`. 8760 timar simulering per år.

### Energibalanse

Summerer utstyrsbudsjettet, dimensjonerer batteriet, samanliknar sol mot last månad for månad, og reknar ut årstotalar for energi, drivstoff og CO₂. Samanliknar òg totalkostnaden over levetida mellom reservekjeldene.

Implementert i `systemResults.ts`.

### Radiolink

Reknar ut om to punkt har fri sikt for trådlaust samband, og om Fresnel-sona er klar. Hentar terrengprofilen mellom punkta frå Kartverket.

Implementert i `radioLink.ts`.

---

## Standalone-kart

Eit NVE-kart over vasskraftverk med minstevassføring, bilete frå Wikipedia og lenker til konsesjonsdokument. Og eit lokasjonskart for solanalyse, der brukaren plukkar staden på kartet og sender koordinatane tilbake til appen.

Filer: `frontend/public/nve-kart-standalone.html` (Leaflet + NVE ArcGIS) og `frontend/public/solar-location-map.html` (kommuniserer med React-appen via `postMessage`).

---

## Rapport

Genererer ein ferdig HTML-rapport med søylediagram, kostnadssamanlikning, tilrådingar og ein KI-pussa tekst som forklarar valet i klart språk.

Implementert i `report.ts`. KI-teksten kjem frå `/api/report`.

---

## Build

```bash
cd frontend
npm install          # pakkar og git-hookar
npm run dev          # Vite-utviklingstenar (localhost:5173)
npm run build:test   # bygg + kopier til test-deploy/
```
