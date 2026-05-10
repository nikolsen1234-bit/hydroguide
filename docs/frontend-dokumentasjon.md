# Frontend-dokumentasjon

Oppdatert: 2026-05-03

Frontend er React/Vite-appen for `hydroguide.no`. Den bruker TypeScript, Tailwind, React Router og Leaflet. Teksten er nynorsk med engelsk som alternativ.

## Brukerflyt

```mermaid
flowchart LR
    welcome["/  WelcomePage"]
    overview["/oversikt OverviewPage"]
    main["/prosjektgrunnlag / /projectbasis MainPage<br/>9 spørsmål om inntaket"]
    system["/parametere / /systems SystemPage<br/>sol/batteri/reserve"]
    components["/komponenter / /components ComponentsPage<br/>utstyrslast"]
    analysis["/analyse AnalysisPage<br/>energianalyse + tilråding"]
    radio["/radiolinje / /radiolink RadioLinkPage"]
    docs["/dokumentasjon DocumentationPage"]
    api["/api ApiPage"]
    contact["/kontakt ContactPage"]

    welcome --> overview
    overview --> main
    main --> system
    system --> components
    components --> analysis
    overview -.->|kalkulator-modus| analysis
    welcome -.-> radio
    welcome -.-> docs
    welcome -.-> api
    welcome -.-> contact
```

Hovedflyten er "5-trinns konfigurasjon": Velkomst → Oversikt → Prosjektgrunnlag → Parametere → Komponenter → Analyse. Sidesporene (radiolink, dokumentasjon, API, kontakt) er tilgjengelige hele tiden.

## Sider

| Side | Rute | Kilde | Beskrivelse |
|------|------|--------|-------------|
| `WelcomePage` | `/` | `frontend/src/pages/WelcomePage.tsx` | Landingsside og modusvelger |
| `OverviewPage` | `/oversikt` | `OverviewPage.tsx` | Sammendrag av konfigurasjon |
| `MainPage` | `/prosjektgrunnlag`, `/projectbasis` | `MainPage.tsx` | Spørsmål Q1-Q9 om inntaket |
| `SystemPage` | `/parametere`, `/systems` | `SystemPage.tsx` | Sol, batteri, reservekraft |
| `ComponentsPage` | `/komponenter`, `/components` | `ComponentsPage.tsx` | Komponenter, effekt og forbruk |
| `AnalysisPage` | `/analyse` | `AnalysisPage.tsx` | Energibalanse, kostnad og tilråding |
| `RadioLinkPage` | `/radiolinje`, `/radiolink` | `RadioLinkPage.tsx` | Siktlinje og Fresnel-sone for radiolink |
| `DocumentationPage` | `/dokumentasjon` | `DocumentationPage.tsx` | Teknisk bakgrunn med formler |
| `ContactPage` | `/kontakt` | `ContactPage.tsx` | Prosjektgruppe og kontakt |
| `ApiPage` | `/api` | `ApiPage.tsx` | OpenAPI-vising inne i arbeidsflata |

## Tilstand

```mermaid
flowchart LR
    pages[Sider og komponenter]

    subgraph context[React Context]
        cfg[ConfigurationContext<br/>multi-config tilstandsmaskin]
        lang[LanguageContext<br/>nn / en]
    end

    subgraph persist[Persistens]
        ls[(localStorage)]
        url[Rute-state<br/>?config=ID]
    end

    pages <--> cfg
    pages <--> lang
    cfg <--> ls
    cfg <--> url
```

`ConfigurationContext` holder flere parallelle konfigurasjoner i minnet samtidig — brukeren kan sammenligne scenarier uten å miste det forrige. Hver konfig får egen ID, lagres i `localStorage` og refereres fra URL-en som `?config=<id>`. Det betyr at refresh midt i en analyse ikke mister data, og en delt URL åpner riktig konfig.

`LanguageContext` styrer UI-språket separat fra konfigurasjonen.

## Komponentlag

Felles komponenter i `frontend/src/components/` (gjenbrukt på flere sider):

| Komponent | Bruk |
|-----------|------|
| `FormFields.tsx` | `SelectField`, `NumberField`, `JaNeiField` osv. — felles input-stil |
| `WorkspaceHeader.tsx`, `WorkspaceActions.tsx` | Standard sidelayout |
| `SystemCharts.tsx` | Egenutviklede SVG-diagrammer (ingen chart-bibliotek) |
| `RadioLinkMap.tsx`, `NveStandaloneMap.tsx` | Kartvisninger |
| `ImportDropZone.tsx` | Import av lagret konfigurasjon |
| `BuildInfoBadge.tsx` | Synlig build-versjon (genereres av `prebuild`-script) |
| `HydroGuideLogo.tsx` | Logo |

Felles Tailwind-klasser er sentralisert i `frontend/src/styles/`.

## Spørsmål og anbefaling

Brukeren svarer på ni spørsmål om inntaket. Logikken som tolker svarene og foreslår løsning for slipp og måling ligger i `frontend/src/utils/recommendation.ts`.

Vannføringsgrenser:

- liten: opptil 30 l/s
- middels: opptil 120 l/s
- stor: over 120 l/s

## Beregningsmoduler

Beregningene er delt opp etter ansvar. Samme modulnavn er brukt konsekvent i `frontend/src/utils/`.

### Modi

| Modus | Beskrivelse |
|-------|-------------|
| Kalkulator | Rask dimensjonering uten prosjektgrunnlag |
| HydroGuide | Full arbeidsflyt med prosjektgrunnlag og NVE-data |

### Solstråling

Bruker månedlige solinnstrålingsverdier som prosjektdata. Verdiene kan justeres i systembildet og inngår i energibalansen sammen med panelstørrelse, panelantall og virkningsgrad.

### Horisontprofil

Horisont-PDF-verktøyene i `tools/` er separate analysehjelpere. React-appen bruker ikke lenger en egen horisontprofilmodul i hovedflyten.

### Batterisimulering

Dimensjonerer batteribank fra månedlig energibalanse, nominell spenning, maksimal utladingsgrad og valgt reservekilde.

### Energibalanse

Summerer utstyrsbudsjettet, dimensjonerer batteriet, sammenligner sol mot last måned for måned, og regner ut årstotaler for energi, drivstoff og CO2. Den sammenligner også totalkostnaden over levetiden mellom reservekildene.

Implementert i `systemResults.ts`. Samme modul finnes i `backend/services/calculations/` slik at API og frontend bruker én felles beregningskjerne.

### Radiolink

Regner ut om to punkter har fri sikt for trådløst samband, og om Fresnel-sonen er klar. Terrengprofilen mellom punktene blir hentet fra Kartverket.

Implementert i `radioLink.ts`.

## Standalone-kart

Det finnes to statiske HTML-kart utenfor React-treet:

- `frontend/public/nve-kart-standalone.html` — NVE-kart over vannkraftverk med minstevannføring, Wikipedia-bilder og lenker til konsesjonsdokument.

**Standalone-kart:** kartene bruker Leaflet med tunge plugins som lastes isolert fra resten av React-bundlen. `postMessage` gir API mellom iframe og React uten delt tilstand.

## Internasjonalisering

Tekster er definert i `frontend/src/i18n/`:

- `nn.ts` — nynorsk (default)
- `en.ts` — engelsk
- `types.ts` — typebeskrivelse av nøkler
- `dynamicStrings.ts` — runtime-genererte tekster (eks. tabellrad-overskrifter)
- `LanguageContext.tsx` — runtime-velger

UI-språk er nynorsk. Engelsk er valgbart for sensor eller eksterne lesere.

## Rapport

Frontend genererer en HTML-rapport med diagrammer, kostnadssammenligning, tilrådinger og AI-tekst som forklarer valget i klart språk.

Implementert i `report.ts`. AI-teksten kommer fra `POST /api/report`, som går via `hydroguide-report` og lokal report-agent bridge (se [arkitektur-dokumentasjon.md](arkitektur-dokumentasjon.md)).

## Bygg og deploy

```bash
cd frontend
npm ci              # installer nøyaktige låste pakker
npm run dev         # Vite-utviklingstjener på localhost:5173
npm run build       # TypeScript-check + Vite-build til dist/
npm run build:test  # bygg og kopier til test-deploy/
```

Frontend blir deployet som statiske filer til Cloudflare. Workers-deploy går via Cloudflare Workers Builds (se [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)).

`scripts/update-build-info.mjs` kjører som `prebuild` og legger inn build-versjon som `BuildInfoBadge` viser i UI.

## Lokal API-bridge

I `npm run dev`-modus mapper `vite.config.ts` `/api/*`-kall lokalt til handlere i `backend/api/*.js`. Det gjør at frontend kan teste mot ekte handler-kode uten å deploye Workers. Bridge-rutene er definert i `vite.config.ts`.

For lokalt oppsett, krav og fellesfeil: se [utvikling-dokumentasjon.md](utvikling-dokumentasjon.md).

## Se også

- Endepunkter frontend kaller: [backend-dokumentasjon.md](backend-dokumentasjon.md)
- Lokal rapportagent: [../tools/agent-bridge/README.md](../tools/agent-bridge/README.md)
- Lokal utvikling: [utvikling-dokumentasjon.md](utvikling-dokumentasjon.md)
