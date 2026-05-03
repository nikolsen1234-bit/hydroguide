# Sikkerhet i HydroGuide

Oppdatert: 2026-05-03

Dette dokumentet svarer på "hva er trusselbildet, og hva har vi gjort for å motvirke det". Detaljerte WAF-regler, secrets og deploy-rutiner er i [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md).

## Trusselbilde

Realistiske trusler vi har designet mot:

| # | Trussel | Hvorfor relevant |
|---|---------|------------------|
| T1 | Stjålne eller lekkede API-nøkler | Offentlig `/api/calculations` bruker Bearer-nøkler |
| T2 | Lekket Cloudflare deploy-token | Full deploy-tilgang gir full kompromittering |
| T3 | Rute-skanning og kildeprobing | Standard angrep mot ethvert offentlig domene |
| T4 | Misbruk av admin-endepunkt fra utsiden | Key-administrasjon må ikke være offentlig |
| T5 | Direkte kall til intern AI-Worker | AI-token og prompts skal ikke være eksponert |
| T6 | Rate-misbruk og DOS av API | LLM-kall i rapport-AI er dyre per request |
| T7 | Prompt-injection via NVE-data eller brukertekst | Rapport-AI mottar tekst fra flere kilder |
| T8 | Klartekst-lagring av sensitive verdier i Git | Repoet er offentlig synlig |

## Forsvar i lag

### Lag 1 — nettverk og transport

- TLS-modus `strict` mot origin (Cloudflare→Workers).
- Always Use HTTPS og Automatic HTTPS Rewrites er på.
- TLS 1.3 er på, minimum TLS 1.2.
- DNSSEC er aktiv på `hydroguide.no`.

Motvirker: T3 (avlytting og protokoll-nedgradering).

### Lag 2 — Cloudflare WAF

| Type | Mål | Respons |
|------|-----|---------|
| Custom rule | `/rest/*`, `/api/v1/*` | 403 — prefiks utenfor kontrakten |
| Custom rule | `/api/keys*` | 403 — admin må gå via `/admin/keys` |
| Custom rule | `.env`, `.secrets`, `/.git*`, `/.ai*`, `/backend*`, `/node_modules*` | 403 — kilde- og secret-probing |
| Custom rule | `TRACE`, `TRACK`-metoder | 403 — kjent HTTP-metode-misbruk |
| Custom rule | `/admin/*` med feil metode | 403 — reduserer overflate på admin |
| Managed ruleset | Cloudflare Managed Free | OWASP-treff, blokk eller utfordring |
| Rate limit | `/api/*` og `/admin/*` | 40 req per 10s per IP/datasenter, 10s blokk |

Motvirker: T3, T4, T6.

### Lag 3 — applikasjon (Workers)

| Tiltak | Hvor |
|--------|-----|
| HMAC-hash av API-nøkler i KV (SHA-256, konstanttid-sammenligning) | `hydroguide-api` |
| Bearer-token `ADMIN_TOKEN` for admin-operasjoner | `hydroguide-admin` |
| Service binding `REPORT_AI_WORKER` (ingen offentlig AI-route) | `hydroguide-report` -> `hydroguide-ai` |
| `REPORT_WORKER_TOKEN` som intern bearer mellom report og AI | begge Workerne |
| `REPORT_ACCESS_CODE_HASH` validerer at rapportkall kommer fra nettsiden | `hydroguide-report` |
| Skjemavalidering av request-body | `/api/calculations` |
| `workers_dev: false` på alle Workers | hindrer `*.workers.dev`-omgåing |
| `ALLOWED_ORIGINS` på rapport-AI | bare `hydroguide.no` og lokal dev |

Motvirker: T1, T4, T5, T7 (delvis — se Lag 4).

### Lag 4 — data og lagring

- API-nøkler: bare hash-form i KV, aldri klartekst.
- R2-isolasjon: `hydroguide-minimum-flow` (offentlig lesbar via API) er skilt fra `hydroguide-ai-reference` (intern retrieval). Kompromittering av én bucket gir ikke tilgang til den andre.
- `REPORT_RULES` KV inneholder faste regler og utdrag som rapport-AI alltid skal støtte seg på. Dette reduserer rom for at modellen skal "finne på" regler.
- Tracked Wrangler-config har placeholders, ikke ekte IDer eller namespace-IDer.
- Sensitive lokale filer (`.secrets`, `backend/config/cloudflare.private.json`) er kryptert med git-crypt.

Motvirker: T1 (lekkasje gir ikke brukbare nøkler), T2 (placeholders i stedet for token), T7 (faste regler vs. modell-fantasi), T8.

### Lag 5 — drift

- Cloudflare Secrets Store er primærkilde for tokens. Lokal `.secrets` er backup, kryptert med git-crypt.
- `check-worker-hygiene.mjs` kjører i pre-commit og CI. Den:
  - validerer offentlig config,
  - blokkerer commit av `*.generated.wrangler.jsonc`,
  - blokkerer commit av private deploy-filer,
  - krever oppdatert branch mot upstream før Worker-endring.
- `check-secrets.mjs` kjører i pre-commit og blokkerer kjente secret-mønstre.
- Token-rotasjon ved tvil: tokener som er limt inn i chat eller brukt utenfor vanlig drift.
- Cloudflare Workers Builds-token er smal: bare Workers + relaterte ressurser, ikke full account-tilgang.

Motvirker: T2, T8.

## Trussel-til-kontroll-mapping

| Trussel | Primærkontroll | Forsvar i dybden |
|---------|----------------|------------------|
| T1 stjålne API-nøkler | HMAC-hash i KV (Lag 3+4) | Rate limit (Lag 2), audit ved unormal bruk |
| T2 lekket deploy-token | Smal Workers Builds-token (Lag 5) | Cloudflare Secrets Store, lokal git-crypt (Lag 4+5) |
| T3 rute-skanning | WAF custom rules (Lag 2) | TLS-strict, DNSSEC (Lag 1) |
| T4 admin fra utsiden | Skilt Worker + WAF-blokk (Lag 2+3) | `ADMIN_TOKEN` (Lag 3) |
| T5 direkte AI-kall | `workers_dev: false` + ingen route (Lag 3) | `REPORT_WORKER_TOKEN` (Lag 3) |
| T6 rate-misbruk | Cloudflare rate limit (Lag 2) | Per-API-nøkkel rate limit i KV (Lag 3) |
| T7 prompt-injection | Faste utdrag i `REPORT_RULES` (Lag 4) | `NARRATIVE_MODE: supplement`, `NARRATIVE_MAX_WORDS: 250` (Lag 3) |
| T8 secrets i Git | git-crypt + placeholders (Lag 4+5) | `check-secrets.mjs` (Lag 5) |

## Kjente begrensninger

Vi har valgt å være ærlige om hva som ikke er på plass:

- **Ingen audit-log per request på API-nøkkel-bruk.** Cloudflare-logg gir oss tidsstempel og status, men vi har ikke strukturert per-nøkkel-statistikk i KV.
- **Ingen automatisk secrets-rotasjon.** Token-rotasjon skjer manuelt ved mistanke.
- **Cloudflare Free-rate-limit er per datasenter, ikke globalt.** Distribuerte angrep fra mange Cloudflare-PoP-er kan komme over grensen lokalt uten å trigge global blokk.
- **Pipeline-LLM blir ikke validert mot skjema automatisk.** Output fra `tools/minstevann/` blir manuelt sjekket før upload til R2.
- **Rapport-AI har ikke rate limit per API-nøkkel ennå.** Cloudflare Worker-rate-limit dekker per IP. Per-nøkkel rate limit står på listen.
- **Prompt-injection-mottiltak er konservativ tekstgrense, ikke reell deteksjon.** `NARRATIVE_MAX_WORDS: 250` reduserer skade om modellen blir ledet på avveie, men oppdager det ikke.
- **Ingen sikkerhetsbevis utover designet.** Vi har ikke kjørt formell pentest.

## Se også

- Detaljert WAF, secrets, deploy-flyt: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Hvordan service binding-flyten er bygget: [arkitektur.md](arkitektur.md)
- Rapport-AI og prompt-strategi: [ai-strategi.md](ai-strategi.md)
