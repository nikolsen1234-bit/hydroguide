# Backend-Dokumentasjon

Oppdatert: 2026-05-03

Backend-koden er delt i Worker-entrypoints, endpoint-handlarar, intern AI-logikk, berekningskjerne og vedlikehaldsskript. Dette dokumentet er **domeneinndelt** — kvar seksjon dekker eitt arbeidsfelt frå rute til lagring.

## Mappestruktur

```text
backend/
  api/                        Delte endpoint-handlarar
    _apiUtils.js              Auth, rate limit, CORS
    _constants.js             Felles konstantar
    _edgeUtils.js             Edge-runtime hjelparar
    calculations.js           POST /api/calculations
    docs.js                   GET /api/docs[?ui]
    health.js                 GET /api/health
    nveid.js                  GET /api/nveid[/...]
    place-suggestions.js      POST /api/place-suggestions
    pvgis-tmy.js              GET /api/pvgis-tmy
    report.js                 POST /api/report (handler)
    terrain-profile.js        POST /api/terrain-profile
    keys/                     (intern bruk frå admin-Worker)
  admin/keys/index.js         POST/GET/DELETE /admin/keys
  workers/
    api/index.js              Public API Worker
    report/index.js           Report Worker
    ai/index.ts               Intern AI Worker
    admin/index.js            Admin Worker
  cloudflare/                 Wrangler-konfig per Worker
  services/
    ai/                       Rapport-AI implementasjon
    calculations/             Delt berekningskjerne (frontend + backend)
  data/
    minimumflow.json          Lokal kopi av NVEID-data
    cloudflare-kv/            KV seed-data
    nveid/                    NVEID-pipeline mellomtilstand
  scripts/                    Cloudflare, R2 og KV-vedlikehald
```

## Domene 1 — Berekning

**Spørsmål domenet svarer på:** "Gitt eit inntak og eit utstyrsbudsjett, kor mykje energi kan vi rekne med, og er det nok til drift?"

| Element | Lokasjon |
|---------|----------|
| Endepunkt | `GET /api/calculations` (skjema), `POST /api/calculations` (berekning) |
| Worker | `hydroguide-api` |
| Handler | `backend/api/calculations.js` |
| Logikk | `backend/services/calculations/_calculationCore.js` |
| Auth | `Authorization: Bearer <api_key>` (HMAC-verifisering) |
| Lagring | `API_KEYS` KV (verifisering, rate limit) |

Berekningskjernen er rein logikk brukt av både API og frontend. Han validerer input, reknar utstyrsbudsjett, batterikapasitet, energibalanse og kostnad over levetid. Same modul i `backend/services/calculations/` blir importert av frontend i utviklingsmodus via Vite-bridge, slik at frontend og backend ikkje kan kome ut av sync.

**Feiltilfelle:**
- 401 dersom API-nøkkel manglar eller er ugyldig.
- 429 dersom rate limit (40 req per 10s) er overskride.
- 422 dersom input-skjema feilar validering.

## Domene 2 — NVEID og Minstevassføring

**Spørsmål domenet svarer på:** "Kva krev NVE av dette spesifikke kraftverket?"

| Element | Lokasjon |
|---------|----------|
| Endepunkt | `GET /api/nveid`, `GET /api/nveid/{id}`, `GET /api/nveid/{id}/minimum-flow`, `GET /api/nveid/{id}/concession` |
| Worker | `hydroguide-api` |
| Handler | `backend/api/nveid.js` |
| Lagring | `MINIMUM_FLOW_BUCKET` R2 (`api/minimumflow.json`) |
| Lokal kopi | `backend/data/minimumflow.json` |

**Directory-regel:** rotruter viser meny og neste steg, ikkje heile filinnhaldet.

| Rute | Returnerer |
|------|-------------|
| `/api/nveid` | Endepunkt-info og éin neste-rute: `/api/nveid/{nveID}` |
| `/api/nveid/{nveID}` | Meny for stasjonen: `minimum-flow`, `concession` |
| `/api/nveid/{nveID}/minimum-flow` | Berre minstevassføring-seksjonen |
| `/api/nveid/{nveID}/concession` | Berre konsesjonslenke/mapping |

Vi dumpar aldri rå `minimumflow.json` frå rota.

**Feiltilfelle:**
- 404 dersom NVEID ikkje finst i datasettet.
- 503 dersom R2 er utilgjengeleg.

## Domene 3 — Rapport

**Spørsmål domenet svarer på:** "Generer ein lesbar rapport som forklarar val og anbefalingar i klart språk."

| Element | Lokasjon |
|---------|----------|
| Endepunkt | `POST /api/report` |
| Worker (front) | `hydroguide-report` |
| Worker (intern) | `hydroguide-ai` (ingen offentleg route) |
| Handler | `backend/api/report.js`, `backend/workers/report/index.js`, `backend/workers/ai/index.ts` |
| Implementasjon | `backend/services/ai/` |
| Auth (utside) | `REPORT_ACCESS_CODE_HASH` (frå nettsida) |
| Auth (intern) | `REPORT_WORKER_TOKEN` |
| Lagring | `REPORT_RULES` KV (faste reglar), `AI_REFERENCE_BUCKET` R2 (NVE-referansar) |

**Flyt:**

```text
Frontend
  -> POST /api/report (access code)
  -> hydroguide-report
       - validerer access code
       - rate limit
       - service binding REPORT_AI_WORKER (REPORT_WORKER_TOKEN)
  -> hydroguide-ai
       - retrieval (REPORT_RULES + AI_REFERENCE_BUCKET + AI Search)
       - prompt-bygg
       - AI Gateway (cache, retry, modell-fallback)
       - returnerer { text }
  -> Frontend renderar HTML-rapport
```

Detaljar om prompt, retrieval og kostnad: [ai-rapport.md](ai-rapport.md) og [ai-strategi.md](ai-strategi.md).

**Feiltilfelle:**
- 401 dersom access code er feil.
- 429 dersom rate limit er overskride.
- 502 dersom AI-Worker svarer feil eller tek over timeout.
- Fallback til `gpt-5.4-mini` skjer automatisk i AI-Workeren.

## Domene 4 — Admin

**Spørsmål domenet svarer på:** "Korleis administrerer vi API-nøklar utan å eksponere det offentleg?"

| Element | Lokasjon |
|---------|----------|
| Endepunkt | `GET /admin/keys`, `POST /admin/keys`, `DELETE /admin/keys/{id}` |
| Worker | `hydroguide-admin` (ingen overlapp med `/api/*`) |
| Handler | `backend/admin/keys/index.js` |
| Auth | `Authorization: Bearer <ADMIN_TOKEN>` |
| Lagring | `API_KEYS` KV |
| Hash-secret | `API_KEY_HASH_SECRET` |

**Kvifor `/admin/*` og ikkje `/api/keys`:**
- `/api/keys*` er WAF-blokkert med 403. Dette er defense in depth — sjølv om ein Worker ved feil tek `/api/keys`, slepp ikkje requesten gjennom.
- Admin-overflate er fysisk skild i eigen Worker, slik at offentleg API-kompromittering ikkje gir admin-tilgang.

**Flyt for ny nøkkel:**
1. POST /admin/keys med metadata.
2. Workeren genererer klartekst-nøkkel.
3. Workeren reknar HMAC(klartekst, `API_KEY_HASH_SECRET`).
4. Berre HMAC-en blir lagra i KV.
5. Klartekst-nøkkelen blir returnert éin gong, så er han borte.

**Feiltilfelle:**
- 401 dersom `ADMIN_TOKEN` manglar eller er feil.
- 404 dersom nøkkel-ID ikkje finst.

## Domene 5 — Frontend-hjelparar

**Spørsmål domenet svarer på:** "Frontend treng små proxy-kall som ikkje skal vere offentleg API."

| Endepunkt | Worker | Handler | Bruk |
|-----------|--------|---------|------|
| `POST /api/place-suggestions` | `hydroguide-api` | `backend/api/place-suggestions.js` | Stadsøk via Kartverket |
| `POST /api/terrain-profile` | `hydroguide-api` | `backend/api/terrain-profile.js` | Terrengprofil for radiolink/horisont |
| `GET /api/pvgis-tmy` | `hydroguide-api` | `backend/api/pvgis-tmy.js` | PVGIS TMY-soldata |

`place-suggestions` og `terrain-profile` er kallbare frå nettsida, men er **ikkje** dokumentert i `/api/docs?ui` som offentleg API. Dei finst for å skjule eksterne API-detaljar (URL-format, eventuell auth) frå browseren.

`pvgis-tmy` er ein offentleg GET-proxy med rate limit — han er dokumentert.

**Feiltilfelle:**
- 502 dersom oppstrøms-tenest (Kartverket, PVGIS) feilar.
- 429 dersom rate limit er overskride.

## Tverrgåande Element

### Auth, rate limit, CORS

`backend/api/_apiUtils.js` har:
- HMAC-verifisering av API-nøklar mot `API_KEYS` KV.
- Rate limit-teljing per nøkkel (utfyllande til Cloudflare per-IP rate limit).
- CORS-handsaming for browserkall.
- Standardisert feilrespons-format.

Same modul brukes av `hydroguide-api` og `hydroguide-admin`.

### Felles konstantar

`backend/api/_constants.js` har felles tekstar, statuskodar og defaults brukt av fleire handlarar.

### Edge-runtime hjelparar

`backend/api/_edgeUtils.js` har små verktøy som ikkje treng full Node.js-API.

## Vedlikehaldsskript

| Skript | Bruk |
|--------|------|
| `build-cloudflare-worker-config.mjs` | Byggjer og sjekkar generert Cloudflare-konfig |
| `check-worker-hygiene.mjs` | Pre-commit/CI-sjekk av Worker-konfig og branch-status |
| `build-ai-search-corpus.mjs` | Byggjer chunks frå NVE-referansar for AI Search |
| `upload-corpus-to-r2.ps1` | Lastar referansar og embeddings til `AI_REFERENCE_BUCKET` |
| `seed-kv.ps1` | Seedar `REPORT_RULES` KV |
| `fix-r2-metadata.mjs` | Reparerer R2-metadata ved behov |

## Testing

Backend har enheitstestar for handlarar med ikkje-triviell logikk:

- `backend/api/_apiUtils.test.mjs` — auth og rate limit
- `backend/api/nveid.test.mjs` — directory-regel og NVEID-oppslag
- `backend/api/pvgis-tmy.test.mjs` — proxy-feilhandtering
- `backend/cloudflare/wrangler-routes.test.mjs` — at rute-mønstera i Wrangler-config matchar dokumentert kontrakt

Tester kjørast med `node --test backend/...`.

## Sjå Òg

- Worker-deploy og bindings-detaljar: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Trusselbilete og auth-design: [sikkerheit.md](sikkerheit.md)
- Rapport-AI runtime: [ai-rapport.md](ai-rapport.md)
- Lokal utvikling og test: [utvikling.md](utvikling.md)
