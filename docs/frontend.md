# Frontend-Dokumentasjon

Oppdatert: 2026-05-03

Frontend er React/Vite-appen for `hydroguide.no`. Appen brukar TypeScript, Tailwind og Leaflet.

## Sider

| Side | Rute | Beskrivelse |
|------|------|-------------|
| `WelcomePage` | `/` | Landingsside og modusveljar |
| `OverviewPage` | `/oversikt` | Samandrag av konfigurasjon |
| `MainPage` | `/parametere` | Spørsmål Q1-Q9 om inntaket |
| `SystemPage` | `/system` | Sol, batteri, reservekraft og utstyrslast |
| `BudgetPage` | `/effektbudsjett` | Utstyrsbudsjett, effekt og forbruk per eining |
| `AnalysisPage` | `/analyse` | Energianalyse time for time, med pålitelegheit og tilråding |
| `SiktlinjeRadioPage` | `/siktlinje-radio` | Siktlinje og Fresnel-sone for radiolink |
| `DocumentationPage` | `/dokumentasjon` | Teknisk bakgrunn med formlar |
| `ContactPage` | `/kontakt` | Prosjektgruppe og kontaktinformasjon |
| `ApiPage` | `/api` | Innebygd visning av det offentlege API-et |

## Spørsmål Og Anbefaling

Brukaren svarar på ni spørsmål om inntaket. Ut frå svara foreslår appen ei hovudløysing for slepp og måling, med kort grunngjeving og eventuelle tilleggskrav. Logikken ligg i `recommendation.ts`.

Vassføringsgrenser:

- liten: opp til 30 l/s
- middels: opp til 120 l/s
- stor: over 120 l/s

## Beregningar

### Modusar

| Modus | Beskrivelse |
|-------|-------------|
| Rask | Forenkla månadsmodell med lokale standardverdiar |
| Detaljert | Timesvis simulering med soldata, batteri og pålitelegheitsanalyse |
| Kombinert | Forenkla oversikt + detaljert pålitelegheitsanalyse |

### Solstråling

Reknar ut kor mykje sol som treffer panelet kvar time gjennom året. Modellen tek omsyn til solposisjon, horisontskugge, panelvinkel, modultemperatur og verkningsgrad. Klimadata kjem frå EU sitt PVGIS-arkiv via proxyen `/api/pvgis-tmy`.

Implementert i `solarEngine.ts` med data frå `metClient.ts`.

### Horisontprofil

Hentar høgdedata for terrenget rundt staden frå Kartverket og brukar dei til å rekne ut når sola står bak ein åskam.

Implementert i `horizonProfile.ts`. Han samplar 360 retningar og 40 avstandar frå Kartverkets terrengmodell.

### Batterisimulering

Simulerer batteriet time for time gjennom eit heilt år. Resultatet viser lagra energi, brukt energi, tomt batteri, behov for reservekraft og drivstoffkostnad.

Implementert i `batterySimulator.ts`.

### Energibalanse

Summerer utstyrsbudsjettet, dimensjonerer batteriet, samanliknar sol mot last månad for månad, og reknar ut årstotalar for energi, drivstoff og CO2. Han samanliknar òg totalkostnaden over levetida mellom reservekjeldene.

Implementert i `systemResults.ts`.

### Radiolink

Reknar ut om to punkt har fri sikt for trådlaust samband, og om Fresnel-sona er klar. Terrengprofilen mellom punkta blir henta frå Kartverket.

Implementert i `radioLink.ts`.

## Standalone-Kart

Det finst to statiske kart:

- `frontend/public/nve-kart-standalone.html`: NVE-kart over vasskraftverk med minstevassføring, bilete frå Wikipedia og lenker til konsesjonsdokument.
- `frontend/public/solar-location-map.html`: Lokasjonskart for solanalyse. Kartet sender koordinatar tilbake til React-appen med `postMessage`.

## Rapport

Frontend genererer ein HTML-rapport med diagram, kostnadssamanlikning, tilrådingar og AI-tekst som forklarar valet i klart språk.

Implementert i `report.ts`. AI-teksten kjem frå `/api/report`.

## Build

```bash
cd frontend
npm ci              # installer nøyaktige låste pakkar
npm run dev         # Vite-utviklingstenar på localhost:5173
npm run build:test  # bygg og kopier til test-deploy/
```
