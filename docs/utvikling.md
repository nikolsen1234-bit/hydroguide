# Lokal Utvikling

Oppdatert: 2026-05-03

Dette dokumentet dekkjer korleis du set opp HydroGuide lokalt og kjører frontend, backend og pipeline. For deploy til Cloudflare: sjå [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md).

## Krav

| Verktøy | Versjon | Kvifor |
|---------|---------|--------|
| Node.js | 22 LTS | Frontend, Workers, scripts |
| npm | 10+ | Pakkar |
| Python | 3.13+ | `tools/minstevann/` |
| Java | 21 JDK | OpenDataLoader (NVE-PDF-pipeline) |
| Ollama | nyaste | Lokal LLM for pipeline |
| git-crypt | nyaste | Dekryptere `.secrets` og `cloudflare.private.json` (valfritt) |

`JAVA_HOME` må peike på Java 21 for at OpenDataLoader skal starte.

## Førstegangs Oppsett

```bash
git clone https://github.com/nikolsen1234-bit/hydroguide.git
cd hydroguide

# Valfritt — krevst berre for å lese krypterte filer eller deploye lokalt:
git-crypt unlock <path-til-key>

cd frontend
npm ci
```

`npm ci` køyrer òg `prepare`-scriptet som set `core.hooksPath` til `.githooks`. Det aktiverer pre-commit-sjekkane (secrets, doc-style, agent-tracking, worker-hygiene).

## Køyre Frontend Lokalt

```bash
cd frontend
npm run dev
```

Vite startar utviklingstenar på `http://localhost:5173`. Ein bridge-plugin i `vite.config.ts` mappar `/api/*`-kall til handlarar i `backend/api/*.js`. Det betyr at du kan teste mot ekte handler-kode utan å deploye Workers.

Eksempel:
- `GET http://localhost:5173/api/health` treffer `backend/api/health.js`
- `POST http://localhost:5173/api/calculations` treffer `backend/api/calculations.js`

## Køyre Mot Ekte Cloudflare-tenester

Bridge-en dekkjer det meste av handlar-logikken, men nokre ting krev ekte Cloudflare-bindingar:

- Rapport-AI (`/api/report`) — krev AI Gateway, AI Search, R2-referansar.
- NVEID-data (`/api/nveid/*`) — krev R2-bucket med `api/minimumflow.json`.

For å teste mot dei ekte tenestene:

```bash
cd frontend
npm run build
npx wrangler dev --config ../backend/cloudflare/api.generated.wrangler.jsonc
```

Krev at `cloudflare.private.json` er dekryptert lokalt og at deploy-config er generert (`build-cloudflare-worker-config.mjs --write-deploy-config`).

## Bygg Og Test

```bash
cd frontend
npm run build         # TypeScript-check + Vite-build til dist/
npm run build:test    # bygg + kopier til test-deploy/
npm run check:knip    # uavhengig: dødkode-sjekk
npm run check:excel   # uavhengig: validerer Excel-referansar
```

For backend-testar:

```bash
node --test backend/api/_apiUtils.test.mjs
node --test backend/api/nveid.test.mjs
node --test backend/api/pvgis-tmy.test.mjs
node --test backend/cloudflare/wrangler-routes.test.mjs
```

## Pre-commit-sjekkar

`.githooks/pre-commit` køyrer automatisk når du commit'ar:

| Sjekk | Bruk |
|-------|------|
| `check-secrets.mjs --staged` | Blokkerer kjente secret-mønster |
| `check-doc-style.mjs --staged` | Validerer dokumentstil |
| `check-agent-tracking.mjs --staged` | Krev oppdatert agent-worklog ved kodeendring |
| `check-worker-hygiene.mjs --staged` | Validerer Worker-konfig, blokkerer generated.wrangler.jsonc |

Får du blokk: les feilmeldinga og rett *årsaka*, ikkje bypass med `--no-verify`.

## Pipeline (Minstevassføring)

Pipeline-en hentar minstevassføringskrav frå NVE-konsesjons-PDF og produserer `backend/data/minimumflow.json`.

```bash
python -m pip install -e ./tools/minstevann

python tools/minstevann/run.py plant 1696        # éin stasjon
python tools/minstevann/run.py batch --n 500     # 500 stasjonar
python tools/minstevann/run.py batch --resume    # fortset etter stopp
python tools/minstevann/run.py export            # skriv til backend/data/minimumflow.json
```

Detaljar (Ollama-modell, OCR-oppsett, validering): [tools/minstevann/README.md](../tools/minstevann/README.md).

Etter eksport må JSON lastast opp til R2:

```bash
npx wrangler r2 object put hydroguide-minimum-flow/api/minimumflow.json \
  --file backend/data/minimumflow.json
```

## Vanlege Feil

| Symptom | Årsak | Løysing |
|---------|-------|---------|
| `Bridge route not found` i Vite | `vite.config.ts` manglar mapping for ein ny rute | Legg til mappinga i `functionsDevBridge`-pluginen |
| `git-crypt: file not found` ved lesing av `.secrets` | git-crypt unlock manglar | Køyr `git-crypt unlock` med riktig key |
| `wrangler deploy` feilar med "missing token" | `CLOUDFLARE_API_TOKEN` manglar i miljø | Last inn frå dekryptert `.secrets` eller bruk Cloudflare Workers Builds (sjå [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)) |
| `JAVA_HOME` ikkje sett for OpenDataLoader | Java 21 ikkje funne | Sett `JAVA_HOME` til Java 21-installasjon |
| `Ollama: model not found` i pipeline | Modellen er ikkje pulla | `ollama pull gemma4:e4b-it-q4_K_M` |
| Pre-commit-blokk på "secrets staged" | Reell secret er staget eller falsk-positiv | Fjern secret, eller dokumenter unntak i hook-konfig |
| Worker-hygiene blokkerer commit av Worker-endring | Branch ligg bak `origin/main` | `git pull --rebase origin main`, så commit på nytt |

## Sjå Òg

- Deploy-flyt: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Backend-handlarar og endepunkt: [backend-dokumentasjon.md](backend-dokumentasjon.md)
- Frontend-struktur: [frontend.md](frontend.md)
- Sikkerheit og secrets: [sikkerheit.md](sikkerheit.md)
- Pipeline-detaljar: [tools/minstevann/README.md](../tools/minstevann/README.md)
- Agent-protokoll for AI-assistert utvikling: `.ai/agent-protocol.md`
