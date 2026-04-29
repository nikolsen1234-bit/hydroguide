# Frontend

Oppdatert: 2026-04-29

React/Vite SPA som kjører på Cloudflare Pages. TypeScript, Tailwind CSS, Leaflet for kart.

## Sider

| Side | Rute | Beskrivelse |
|------|------|-------------|
| `WelcomePage` | `/` | Landingsside |
| `MainPage` | `/system` | Hovedkonfigurasjon — spørsmålsbasert wizard for anleggsoppsett |
| `SystemPage` | `/system/results` | Systemresultater og dimensjonering |
| `AnalysisPage` | `/analysis` | Solstråling, horisontprofil, solposisjon |
| `BudgetPage` | `/budget` | Energibudsjett og batteriautonomi |
| `OverviewPage` | `/overview` | Sammendrag av konfigurasjon |
| `SiktlinjeRadioPage` | `/siktlinje` | Radiolink-beregning med kart |
| `DocumentationPage` | `/docs` | NVE-dokumentasjon og referanser |
| `ApiPage` | `/api` | Swagger UI iframe (`/api/docs?ui`) |
| `ContactPage` | `/contact` | Kontaktinformasjon |

## Komponenter

| Komponent | Funksjon |
|-----------|----------|
| `FormFields` | Gjenbrukbare input-felt for wizard |
| `WorkspaceSection` / `WorkspaceHeader` / `WorkspaceActions` | Layout-rammeverk for arbeidsområder |
| `HorizonChart` | SVG-chart for horisontprofil |
| `PanoramicHorizon` | 360°-panoramavisning av horisont |
| `SolarPositionChart` | Solbane gjennom året |
| `ReliabilityCharts` | Pålitelighets- og autonomi-grafer |
| `SystemCharts` | Systemdimensjonering-visualisering |
| `NveStandaloneMap` | NVE-kart i iframe (vannkraftverk) |
| `RadioLinkMap` | Leaflet-kart for siktlinjeberegning |
| `ImportDropZone` | Drag-and-drop for filimport |
| `BuildInfoBadge` | Viser build-info (commit, timestamp) |

## Beregninger (lib/)

| Modul | Ansvar |
|-------|--------|
| `solarEngine` | Solposisjon, irradians, timesoppløsning |
| `batterySimulator` | Batteriautonomi og last-simulering |
| `horizonProfile` | Beregning og lagring av horisontprofil |
| `horizonStore` | Persistent lagring av horisontdata |
| `metClient` | Henting av klimadata fra MET API |

## Internasjonalisering (i18n/)

Støtter norsk (nynorsk) og engelsk. Språk velges i UI, strings i `nn.ts` og `en.ts`. `dynamicStrings.ts` genererer kontekstavhengige labels basert på brukerens konfigurasjon.

## Standalone-kart

To HTML-filer i `public/` som kjører uavhengig av React-appen:

- **nve-kart-standalone.html** — NVE-vannkraftverk med minstevannføring-data, Wikipedia-bilder, konsesjonslenker. Bruker Leaflet + NVE ArcGIS.
- **solar-location-map.html** — Lokasjonspicker for solenergianlegg. Kommuniserer med React via `postMessage`.

Begge har egne CSP-regler i `_middleware.js` fordi de laster tiles fra NVE og Kartverket.

## Build

```bash
cd frontend
npm install          # dependencies + git hooks (prepare-script)
npm run dev          # Vite dev server (localhost:5173)
npm run build        # produksjons-build til dist/
npm run build:test   # build + kopier til test-deploy/
npm run check:knip   # finn unused exports
```

`vite.config.ts` setter opp dev-proxyer for `/api/*`-ruter mot lokal wrangler eller fallback til produksjon.
