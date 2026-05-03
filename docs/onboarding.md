# Onboarding

Oppdatert: 2026-05-03

Steg-for-steg-guide for ny bidragsyter som skal jobbe i HydroGuide-repoet for første gong. Følg listen i rekkefølgje.

## 1. Krav

Sjå [utvikling.md](utvikling.md#krav) for full liste. Minimum:

- Node.js 22 LTS, npm 10+
- Git
- Eit terminalskal (PowerShell, bash, zsh — alt fungerer)

For pipeline-arbeid: Python 3.13+, Java 21, Ollama. Ikkje krevd for vanleg backend/frontend-utvikling.

## 2. Klone og installere

```bash
git clone https://github.com/nikolsen1234-bit/hydroguide.git
cd hydroguide
cd frontend
npm ci
```

`npm ci` køyrer `prepare`-scriptet som set `core.hooksPath` til `.githooks`. Det aktiverer pre-commit- og commit-msg-hookane automatisk.

## 3. Verifiser at hookane fungerer

```bash
cd ..   # tilbake til repo-rota
echo "// test" >> README.md
git add README.md
git commit -m "fix"
```

Du skal få:

```
commit-msg blocked: first line is in low-effort blocklist
  message: "fix"
```

Dette er forventa. Hooken stoppa eit dårleg commit-message. Reverser:

```bash
git reset HEAD README.md
git checkout -- README.md
```

Hvis hooken IKKJE blokkerte: sjå "Feilsøk" lenger ned.

## 4. (Valfritt) git-crypt for sensitive filer

Berre relevant hvis du skal jobbe mot ekte Cloudflare-tenester eller deploye lokalt. Vanleg utvikling treng det ikkje.

```bash
# Få git-crypt key frå maintainer (privat kanal)
git-crypt unlock <path-til-key>
```

Etter unlock:
- `.secrets` blir lesbar (Cloudflare-tokens, lokale verdiar)
- `backend/config/cloudflare.private.json` blir lesbar (account ID, namespace IDs)

Utan unlock: filene er base64-krypterte og ubrukelege, men resten av repoet fungerer fint for build og test.

## 5. Commit-prosedyre

Repoet handhevar same prosedyre for alle bidragsytarar. Sjekkene køyrer både lokalt (pre-commit, commit-msg) og sentralt (CI på pull request — merge er blokkert ved feil).

| Sjekk | Kor blokkerer |
|-------|---------------|
| Ingen `console.log`/`console.debug` i produksjonskode | lokal pre-commit + CI |
| Ingen ekte Cloudflare-IDer i tracked filer | lokal pre-commit + CI |
| Worker-konfig er konsistent og branch er ikkje bak `main` | lokal pre-commit + CI |
| Commit-melding >= 10 tegn og ikkje "fix"/"wip"/etc. | lokal commit-msg + CI |

Unntak for `console.log`: legg til `// allow-console` på same linje hvis loggen er bevisst. Test-filer, `backend/scripts/`, `frontend/scripts/` og `tools/` er unntatt automatisk.

## 6. Første ekte commit

1. Lag ein branch: `git checkout -b din-branch-namn`
2. Gjer ein liten endring (eks. fiks ein typo i ein doc-fil).
3. Stage: `git add <fil>`
4. Commit med ei skikkeleg melding: `git commit -m "Fix typo in <fil>"`
5. Push: `git push -u origin din-branch-namn`
6. Lag PR mot `main` på GitHub.

CI kjører automatisk på PR-en. Hvis raudt kryss: les loggen, fiks, push på nytt.

## 7. Køyre frontend lokalt

```bash
cd frontend
npm run dev
```

Vite startar på `http://localhost:5173`. `/api/*`-kall blir mappa lokalt til `backend/api/*.js`-handlarar. Sjå [frontend.md](frontend.md) og [utvikling.md](utvikling.md) for detaljar.

## 8. Lese dokumentasjonen

| Tema | Dokument |
|------|----------|
| Heile systemet | [arkitektur.md](arkitektur.md) |
| Backend per domene | [backend-dokumentasjon.md](backend-dokumentasjon.md) |
| Frontend | [frontend.md](frontend.md) |
| Cloudflare og deploy | [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md) |
| Sikkerheit | [sikkerheit.md](sikkerheit.md) |
| Rapport-AI | [ai-rapport.md](ai-rapport.md) |
| AI-strategi | [ai-strategi.md](ai-strategi.md) |
| Lokal utvikling | [utvikling.md](utvikling.md) |

## Feilsøk

| Symptom | Årsak | Løysing |
|---------|-------|---------|
| Hook køyrer ikkje | `core.hooksPath` ikkje sett | `git config core.hooksPath .githooks` |
| `pre-commit blocked: 'node' is not on PATH` | Node manglar | Installer Node 22 LTS |
| `pre-commit blocked: required check missing: backend/scripts/check-*.mjs` | Repo er korrupt | `git checkout -- backend/scripts/` |
| `commit-msg blocked: first line is in low-effort blocklist` | Commit-melding er for slurvete | Skriv ei skikkeleg melding |
| `check-no-console blocked` | `console.log` igjen i staget kode | Fjern, eller legg til `// allow-console` om bevisst |
| `check-hardcoded-ids blocked` | Ekte Cloudflare-ID i tracked fil | Bytt til `REPLACE_WITH_*` placeholder |
| `git-crypt: file not found` | Unlock ikkje køyrd, eller key manglar | Ikkje krevd for vanleg utvikling. Be maintainer om key hvis du faktisk treng det. |

## Sjå Òg

- Lokal utvikling i detalj: [utvikling.md](utvikling.md)
- Deploy-flyt (etter PR er merged): [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Sikkerheitsmodell: [sikkerheit.md](sikkerheit.md)
