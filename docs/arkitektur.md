# HydroGuide arkitektur

Oppdatert: 2026-05-03

## Systemkontekst

```mermaid
flowchart TB
    bruker[Bruker]
    operator[Operatør]

    subgraph hg[HydroGuide]
        spa[Statisk frontend<br/>React/Vite/Tailwind]

        subgraph workers[Cloudflare Workers]
            api[hydroguide-api]
            report[hydroguide-report]
            ai[hydroguide-ai<br/>ingen offentlig route]
            admin[hydroguide-admin]
        end

        subgraph storage[Cloudflare lagring]
            kvkeys[(KV API_KEYS)]
            kvrules[(KV REPORT_RULES)]
            r2flow[(R2 hydroguide-minimum-flow)]
            r2ref[(R2 hydroguide-ai-reference)]
        end
    end

    bruker --> spa
    spa -->|/api/*| api
    spa -->|/api/report| report
    operator -->|/admin/*| admin

    report -.service binding.-> ai

    api --> kvkeys
    api --> r2flow
    admin --> kvkeys
    ai --> kvrules
    ai --> r2ref
```

HydroGuide består av en statisk frontend, fire Cloudflare Workers og fire lagringsenheter (to KV-namespaces, to R2-buckets). Workers er delt etter trust-grenser: offentlig API, rapport-mottak, intern AI uten offentlig route, og en isolert admin-Worker.

## Hovedkomponenter

| Komponent | Hva den gjør |
|-----------|--------------|
| Statisk frontend | React/Vite-app som kjører i nettleseren. Kalles direkte av brukeren via `hydroguide.no`. |
| `hydroguide-api` | Tar imot offentlige `/api/*`-kall: beregninger, NVEID-data, PVGIS-proxy, frontend-hjelpere. |
| `hydroguide-report` | Tar imot rapport-forespørsler fra nettsiden, validerer access code, kaller AI-Worker via service binding. |
| `hydroguide-ai` | Lager rapporttekst med en LLM. Har ingen offentlig URL — kun nåbar via service binding. |
| `hydroguide-admin` | Håndterer API-nøkler på `/admin/*`. Skilt ut for å holde admin-overflaten unna det offentlige API-et. |
| `API_KEYS` (KV) | Hash av API-nøkler (HMAC), aktiv-status, rate-limit-tellere. |
| `REPORT_RULES` (KV) | Faste regler og NVE-utdrag som rapport-AI-en alltid skal støtte seg på. |
| `hydroguide-minimum-flow` (R2) | `api/minimumflow.json` med minstevassføring per NVEID. |
| `hydroguide-ai-reference` (R2) | NVE-referanser og embeddings for AI-Search retrieval. |

## Rapport-flyten

```mermaid
flowchart LR
    spa[Frontend] -->|POST /api/report| report[hydroguide-report]
    report -.service binding.-> ai[hydroguide-ai]
    ai --> kv[(REPORT_RULES)]
    ai --> r2[(AI_REFERENCE_BUCKET)]
```

Rapport-flyten går gjennom to Workers. `hydroguide-report` validerer access code fra nettsiden og rate-limiter. Den kaller `hydroguide-ai` via en intern service binding — det betyr at AI-Workeren aldri trenger en offentlig URL. AI-Workeren henter retrieval-grunnlag fra KV (faste regler) og R2 (NVE-referanser via AI Search), bygger prompt, og kaller modell via Cloudflare AI Gateway.

Detaljer om prompt, retrieval og modell: [ai-rapport.md](ai-rapport.md).

## Admin-isolasjon

```mermaid
flowchart LR
    angriper[Angriper] -->|/api/keys| waf[Cloudflare WAF]
    waf -.->|403| angriper

    operator[Operatør] -->|/admin/keys<br/>Bearer ADMIN_TOKEN| admin[hydroguide-admin]
    admin --> kv[(API_KEYS)]
```

Admin er fysisk skilt fra det offentlige API-et — det er en separat Worker (`hydroguide-admin`) på `/admin/*`. Cloudflare WAF blokkerer `/api/keys*` med 403 på sone-nivå, slik at requesten aldri når noen Worker. Det er forsvar i lag: kompromittering av offentlig API gir ikke admin-tilgang. Eventuell feilkonfigurasjon på admin-Worker fanges av WAF og slipper ikke ut.

For trusselbilde og auth-design: [sikkerheit.md](sikkerheit.md).

## Hovedflyt for kall

| Hva brukeren gjør | Hvilken Worker som svarer | Hvilke ressurser brukes |
|-------------------|---------------------------|--------------------------|
| Åpner `hydroguide.no` | Statisk frontend (Cloudflare CDN) | Ingen Worker |
| Henter NVEID-data | `hydroguide-api` | R2 `hydroguide-minimum-flow` |
| Beregner energibalanse | `hydroguide-api` | KV `API_KEYS` (auth + rate limit) |
| Lager rapport | `hydroguide-report` → `hydroguide-ai` | KV `REPORT_RULES`, R2 `hydroguide-ai-reference`, AI Gateway |
| Administrerer API-nøkler | `hydroguide-admin` | KV `API_KEYS` |

## Tekniske valg

| Valg | Vi gjorde | Hvorfor |
|------|-----------|---------|
| Flere Workers vs én monolitt | Fire Workers (api, report, ai, admin) | Skilte trust-grenser. Admin-kompromittering når ikke rapport-AI. AI-Worker har ingen offentlig URL. |
| AI-tilgang fra nettside | Service binding `REPORT_AI_WORKER`, ikke direkte HTTP | AI-Worker trenger aldri offentlig route. Færre angrepsflater. |
| Lagring av minstevassføring | R2-objekt med statisk JSON | ~600 NVEID-er, oppdateres sjelden, oppslag på primærnøkkel — D1 er overkill. |
| Verifisering av API-nøkler | HMAC-hash i KV | Lekket KV-dump gir ikke brukbare nøkler. |
| AI-pipeline for NVE-PDF | Lokalt, ikke Worker | OCR + LLM-batch tar minutter — Workers har 30s CPU-grense. |
| Frontend-routing | Statisk SPA med React Router | Statisk frontend-hosting, ingen SSR-behov. |
| Public API-format | REST + OpenAPI på `/api/docs?ui` | Standard, lett å dokumentere, lett å teste i nettleser. |
| Cache-policy | Bypass for `/api/*` og `/admin/*` | Auth-state og rate-limit må være ferskt. Statisk frontend caches normalt. |

## Eksterne avhengigheter

| Tjeneste | Bruk | Feilhåndtering |
|----------|------|------------------|
| NVE ArcGIS | Konsesjonsdokument til pipeline | Kun pipeline-tid, ikke runtime |
| EU PVGIS | TMY-soldata for solanalyse | Frontend viser feilmelding hvis proxy mister tilgang |
| Kartverket terreng | Horisontprofil + radiolink | Frontend degraderer til advarsel |
| Kartverket stedssøk | Autocomplete | Frontend tillater manuell innskriving |
| Cloudflare AI Gateway | LLM-kall i rapport | `gpt-5.4-mini` fallback, cache-treff reduserer behov |
| Cloudflare AI Search | Retrieval over `AI_REFERENCE_BUCKET` | Faste utdrag i `REPORT_RULES` som siste lag |

## Hva dette dokumentet ikke dekker

| Detalj | Se |
|--------|-----|
| Konkrete endepunkter og handler-filer | [backend-dokumentasjon.md](backend-dokumentasjon.md) |
| Worker-bindinger, secrets, deploy-flyt | [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md) |
| Trusselbilde og forsvar i lag | [sikkerheit.md](sikkerheit.md) |
| Frontend-struktur og brukerflyt | [frontend.md](frontend.md) |
| Rapport-AI runtime og retrieval | [ai-rapport.md](ai-rapport.md) |
| AI-strategi (hallusinering, kostnad, prompt) | [ai-strategi.md](ai-strategi.md) |
| Lokal utvikling | [utvikling.md](utvikling.md) |
