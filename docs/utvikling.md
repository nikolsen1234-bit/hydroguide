# Lokal utvikling

Oppdatert: 2026-05-03

Steg-for-steg-guide for å sette opp og kjøre HydroGuide lokalt. For deploy til Cloudflare: se [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md).

## Krav

| Verktøy | Versjon | Hvorfor |
|---------|---------|--------|
| Node.js | 22 LTS | Frontend, Workers, scripts |
| npm | 10+ | Pakker |
| Python | 3.13+ | `tools/minstevann/` |
| Java | 21 JDK | OpenDataLoader (NVE-PDF-pipeline) |
| Ollama | nyeste | Lokal LLM for pipeline |
| git-crypt | nyeste | Dekryptere `.secrets` og `cloudflare.private.json` (valgfritt) |
| Git | nyeste | Versjonskontroll |

`JAVA_HOME` må peke på Java 21 for at OpenDataLoader skal starte.

## Førstegangs oppsett

```bash
git clone https://github.com/nikolsen1234-bit/hydroguide.git
cd hydroguide
cd frontend
npm ci
```

`npm ci` kjører `prepare`-scriptet som setter `core.hooksPath` til `.githooks`. Det aktiverer pre-commit-, commit-msg- og pre-push-hookene automatisk.

### Verifiser at hookene fungerer

```bash
cd ..   # tilbake til repo-roten
echo "// test" >> README.md
git add README.md
git commit -m "fix"
```

Du skal få:

```
commit-msg blocked: first line is in low-effort blocklist
  message: "fix"
```

Dette er forventet. Hooken stoppet et dårlig commit-message. Reverser:

```bash
git reset HEAD README.md
git checkout -- README.md
```

Hvis hooken IKKE blokkerte: se "Feilsøk" lenger ned.

### (Valgfritt) git-crypt for sensitive filer

Bare relevant hvis du skal jobbe mot ekte Cloudflare-tjenester eller deploye lokalt. Vanlig utvikling trenger det ikke.

```bash
# Få git-crypt-key fra maintainer (privat kanal)
git-crypt unlock <path-til-git-crypt-key>
```

Etter unlock:
- `.secrets` blir lesbar (Cloudflare-tokens, lokale verdier)
- `backend/config/cloudflare.private.json` blir lesbar (account-ID, namespace-IDer)

Uten unlock: filene er base64-krypterte og ubrukelige, men resten av repoet fungerer fint for build og test.

## Commit-prosedyre

Repoet håndhever samme prosedyre for alle bidragsytere. Sjekkene kjører både lokalt (pre-commit, commit-msg) og sentralt (CI på pull request — merge er blokkert ved feil).

| Sjekk | Hvor blokkerer |
|-------|---------------|
| Ingen `console.log`/`console.debug` i produksjonskode | lokal pre-commit + CI |
| Ingen ekte Cloudflare-IDer i tracked filer | lokal pre-commit + CI |
| Ingen `postMessage(*, "*")` (wildcard origin) | lokal pre-commit + CI |
| Worker-konfig er konsistent og branch er ikke bak `main` | lokal pre-commit + CI |
| Commit-melding >= 10 tegn og ikke "fix"/"wip"/etc. | lokal commit-msg + CI |
| Ingen force-push til `main` | lokal pre-push |

Unntak for `console.log`: legg til `// allow-console` på samme linje hvis loggen er bevisst. Test-filer, `backend/scripts/`, `frontend/scripts/`, `private/scripts/` og `tools/` er unntatt automatisk.

## Første ekte commit

1. Lag en branch: `git checkout -b din-branch-navn`
2. Gjør en liten endring (eks. fiks en typo i en doc-fil).
3. Stage: `git add <fil>`
4. Commit med en skikkelig melding: `git commit -m "Fix typo in <fil>"`
5. Push: `git push -u origin din-branch-navn`
6. Lag PR mot `main` på GitHub.

CI kjører automatisk på PR-en. Hvis rødt kryss: les loggen, fiks, push på nytt.

## Kjøre frontend lokalt

```bash
cd frontend
npm run dev
```

Vite starter utviklingstjener på `http://localhost:5173`. En bridge-plugin i `vite.config.ts` mapper `/api/*`-kall til handlere i `backend/api/*.js`. Det betyr at du kan teste mot ekte handler-kode uten å deploye Workers.

Eksempel:
- `GET http://localhost:5173/api/health` treffer `backend/api/health.js`
- `POST http://localhost:5173/api/calculations` treffer `backend/api/calculations.js`

## Kjøre mot ekte Cloudflare-tjenester

Bridge-en dekker det meste av handler-logikken, men noen ting krever ekte Cloudflare-bindinger:

- Rapport-AI (`/api/report`) — krever AI Gateway, AI Search, R2-referanser.
- NVEID-data (`/api/nveid/*`) — krever R2-bucket med `api/minimumflow.json`.

For å teste mot de ekte tjenestene:

```bash
cd frontend
npm run build
npx wrangler dev --config ../backend/cloudflare/api.generated.wrangler.jsonc
```

Krever at `cloudflare.private.json` er dekryptert lokalt og at deploy-config er generert (`build-cloudflare-worker-config.mjs --write-deploy-config`).

## Bygg og test

```bash
cd frontend
npm run build         # TypeScript-check + Vite-build til dist/
npm run build:test    # bygg + kopier til test-deploy/
npm run check:knip    # uavhengig: dødkode-sjekk
npm run check:excel   # uavhengig: validerer Excel-referanser
```

For backend-tester:

```bash
node --test backend/api/_apiUtils.test.mjs
node --test backend/api/nveid.test.mjs
node --test backend/api/pvgis-tmy.test.mjs
node --test backend/cloudflare/wrangler-routes.test.mjs
```

## Pipeline (minstevassføring)

Pipeline-en henter minstevassføringskrav fra NVE-konsesjons-PDF og produserer `backend/data/minimumflow.json`.

```bash
python -m pip install -e ./tools/minstevann

python tools/minstevann/run.py plant 1696        # én stasjon
python tools/minstevann/run.py batch --n 500     # 500 stasjoner
python tools/minstevann/run.py batch --resume    # fortsett etter stopp
python tools/minstevann/run.py export            # skriv til backend/data/minimumflow.json
```

Detaljer (Ollama-modell, OCR-oppsett, validering): [tools/minstevann/README.md](../tools/minstevann/README.md).

Etter eksport må JSON lastes opp til R2:

```bash
npx wrangler r2 object put hydroguide-minimum-flow/api/minimumflow.json \
  --file backend/data/minimumflow.json
```

## Lese dokumentasjonen

| Tema | Dokument |
|------|----------|
| Hele systemet | [arkitektur.md](arkitektur.md) |
| Backend per domene | [backend-dokumentasjon.md](backend-dokumentasjon.md) |
| Frontend | [frontend.md](frontend.md) |
| Cloudflare og deploy | [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md) |
| Sikkerhet | [sikkerheit.md](sikkerheit.md) |
| Rapport-AI | [ai-rapport.md](ai-rapport.md) |
| AI-strategi | [ai-strategi.md](ai-strategi.md) |
| Pipeline | [tools/minstevann/README.md](../tools/minstevann/README.md) |

## Vanlige feil

| Symptom | Årsak | Løsning |
|---------|-------|---------|
| Hook kjører ikke | `core.hooksPath` ikke satt | `git config core.hooksPath .githooks` |
| `pre-commit blocked: 'node' is not on PATH` | Node mangler | Installer Node 22 LTS |
| `pre-commit blocked: required check missing: backend/scripts/check-*.mjs` | Repo er korrupt | `git checkout -- backend/scripts/` |
| `commit-msg blocked: first line is in low-effort blocklist` | Commit-melding er for slurvete | Skriv en skikkelig melding |
| `check-no-console blocked` | `console.log` igjen i staget kode | Fjern, eller legg til `// allow-console` om bevisst |
| `check-hardcoded-ids blocked` | Ekte Cloudflare-ID i tracked fil | Bytt til `REPLACE_WITH_*` placeholder |
| `Bridge route not found` i Vite | `vite.config.ts` mangler mapping for en ny rute | Legg til mappingen i `functionsDevBridge`-pluginen |
| `git-crypt: file not found` ved lesing av `.secrets` | git-crypt unlock mangler | Kjør `git-crypt unlock` med riktig key |
| `wrangler deploy` feiler med "missing token" | `CLOUDFLARE_API_TOKEN` mangler i miljø | Last inn fra dekryptert `.secrets` eller bruk Cloudflare Workers Builds (se [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)) |
| `JAVA_HOME` ikke satt for OpenDataLoader | Java 21 ikke funnet | Sett `JAVA_HOME` til Java 21-installasjon |
| `Ollama: model not found` i pipeline | Modellen er ikke pulla | `ollama pull gemma4:e4b-it-q4_K_M` |
| Pre-commit-blokk på "secrets staged" | Reell secret er staget eller falsk-positiv | Fjern secret, eller dokumenter unntak i hook-konfig |
| Worker-hygiene blokkerer commit av Worker-endring | Branch ligger bak `origin/main` | `git pull --rebase origin main`, så commit på nytt |

## Se også

- Deploy-flyt: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Backend-handlere og endepunkter: [backend-dokumentasjon.md](backend-dokumentasjon.md)
- Frontend-struktur: [frontend.md](frontend.md)
- Sikkerhet og secrets: [sikkerheit.md](sikkerheit.md)
- Pipeline-detaljer: [tools/minstevann/README.md](../tools/minstevann/README.md)
