# Sikkerheit i HydroGuide

Oppdatert: 2026-05-03

Dette dokumentet svarer på "kva er trusselbiletet, og kva har vi gjort for å motverke det". Detaljerte WAF-reglar, secrets og deploy-rutinar er i [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md).

## Trusselbilete

Realistiske trusler vi har designa mot:

| # | Trussel | Kvifor relevant |
|---|---------|------------------|
| T1 | Stolne eller lekka API-nøklar | Offentleg `/api/calculations` brukar Bearer-nøklar |
| T2 | Lekka Cloudflare deploy-token | Fullt deploy-tilgang gir full kompromittering |
| T3 | Rute-skanning og kjelde-probing | Standard angrep mot kvart offentleg domene |
| T4 | Misbruk av admin-endepunkt frå utsida | Key-administrasjon må ikkje vere offentleg |
| T5 | Direkte kall til intern AI-Worker | AI-token og prompts skal ikkje vere eksponert |
| T6 | Rate-misbruk og DOS av API | LLM-kall i rapport-AI er dyre per request |
| T7 | Prompt-injection via NVE-data eller brukartekst | Rapport-AI mottek tekst frå fleire kjelder |
| T8 | Klartekst-lagring av sensitive verdiar i Git | Repoet er offentleg synleg |

## Forsvar I Lag

### Lag 1 — Nettverk og transport

- TLS-modus `strict` mot origin (Cloudflare→Workers).
- Always Use HTTPS og Automatic HTTPS Rewrites er på.
- TLS 1.3 er på, minimum TLS 1.2.
- DNSSEC er aktiv på `hydroguide.no`.

Motverkar: T3 (passive nedstigingsangrep og protokoll-nedgradering).

### Lag 2 — Cloudflare WAF

| Type | Mål | Respons |
|------|-----|---------|
| Custom rule | `/rest/*`, `/api/v1/*` | 403 — prefix utanfor kontrakten |
| Custom rule | `/api/keys*` | 403 — admin må gå via `/admin/keys` |
| Custom rule | `.env`, `.secrets`, `/.git*`, `/.ai*`, `/backend*`, `/node_modules*` | 403 — kjelde- og secret-probing |
| Custom rule | `TRACE`, `TRACK`-metodar | 403 — kjent HTTP-metode-misbruk |
| Custom rule | `/admin/*` med feil metode | 403 — reduserer overflate på admin |
| Managed ruleset | Cloudflare Managed Free | OWASP-treff, blokk eller utfordring |
| Rate limit | `/api/*` og `/admin/*` | 40 req per 10s per IP/datacenter, 10s blokk |

Motverkar: T3, T4, T6.

### Lag 3 — Applikasjon (Workers)

| Tiltak | Kor |
|--------|-----|
| HMAC-hash av API-nøklar i KV (SHA-256, konstanttid-samanlikning) | `hydroguide-api` |
| Bearer-token `ADMIN_TOKEN` for admin-operasjonar | `hydroguide-admin` |
| Service binding `REPORT_AI_WORKER` (ingen offentleg AI-route) | `hydroguide-report` -> `hydroguide-ai` |
| `REPORT_WORKER_TOKEN` som intern bearer mellom report og AI | begge Workerane |
| `REPORT_ACCESS_CODE_HASH` validerer at rapportkall kjem frå nettsida | `hydroguide-report` |
| Skjemavalidering av request-body | `/api/calculations` |
| `workers_dev: false` på alle Workers | hindrar `*.workers.dev`-omgåing |
| `ALLOWED_ORIGINS` på rapport-AI | berre `hydroguide.no` og lokal dev |

Motverkar: T1, T4, T5, T7 (delvis — sjå Lag 4).

### Lag 4 — Data og lagring

- API-nøklar: berre hash-form i KV, aldri klartekst.
- R2-isolasjon: `hydroguide-minimum-flow` (offentleg lesbar via API) er skild frå `hydroguide-ai-reference` (intern retrieval). Kompromittering av éin bucket gir ikkje tilgang til den andre.
- `REPORT_RULES` KV inneheld faste reglar og utdrag som rapport-AI alltid skal støtte seg på. Dette reduserer rom for at modellen skal "finne på" reglar.
- Tracked Wrangler-config har placeholders, ikkje ekte ID-ar eller namespace-ID-ar.
- Sensitive lokale filer (`.secrets`, `backend/config/cloudflare.private.json`) er git-crypt-encrypted.

Motverkar: T1 (lekkasje gir ikkje brukbare nøklar), T2 (placeholders i staden for token), T7 (faste reglar vs. modell-fantasi), T8.

### Lag 5 — Drift

- Cloudflare Secrets Store er primærkjelde for tokens. Lokal `.secrets` er backup, git-crypt-encrypted.
- `check-worker-hygiene.mjs` køyrer i pre-commit og CI. Han:
  - validerer offentleg config,
  - blokkerer commit av `*.generated.wrangler.jsonc`,
  - blokkerer commit av private deploy-filer,
  - krev oppdatert branch mot upstream før Worker-endring.
- `check-secrets.mjs` køyrer i pre-commit og blokkerer kjente secret-mønster.
- Token-rotasjon ved tvil: limt-i-chat-tokens, brukt-utanfor-vanleg-drift-tokens.
- Cloudflare Workers Builds-token er smal: berre Workers + relaterte ressursar, ikkje full account-tilgang.

Motverkar: T2, T8.

## Trussel-til-kontroll-mapping

| Trussel | Primærkontroll | Defense in depth |
|---------|----------------|------------------|
| T1 stolne API-nøklar | HMAC-hash i KV (Lag 3+4) | Rate limit (Lag 2), audit ved unormal bruk |
| T2 lekka deploy-token | Smal Workers Builds-token (Lag 5) | Cloudflare Secrets Store, lokal git-crypt (Lag 4+5) |
| T3 rute-skanning | WAF custom rules (Lag 2) | TLS-strict, DNSSEC (Lag 1) |
| T4 admin frå utsida | Skild Worker + WAF-blokk (Lag 2+3) | `ADMIN_TOKEN` (Lag 3) |
| T5 direkte AI-kall | `workers_dev: false` + ingen route (Lag 3) | `REPORT_WORKER_TOKEN` (Lag 3) |
| T6 rate-misbruk | Cloudflare rate limit (Lag 2) | Per-API-nøkkel rate limit i KV (Lag 3) |
| T7 prompt-injection | Faste utdrag i `REPORT_RULES` (Lag 4) | `NARRATIVE_MODE: supplement`, `NARRATIVE_MAX_WORDS: 250` (Lag 3) |
| T8 secrets i Git | git-crypt + placeholders (Lag 4+5) | `check-secrets.mjs` (Lag 5) |

## Kjende Avgrensingar

Vi har valt å vere ærlege om kva som ikkje er på plass:

- **Ingen audit-log per request på API-nøkkel-bruk.** Cloudflare logg gir oss tidsstempel og status, men vi har ikkje strukturert per-nøkkel-statistikk i KV.
- **Ingen automatisk secrets-rotasjon.** Token-rotasjon skjer manuelt ved mistanke.
- **Cloudflare Free-rate-limit er per datacenter, ikkje globalt.** Distribuerte angrep frå mange Cloudflare-PoP-ar kan kome over grensa lokalt utan å trigge global blokk.
- **Pipeline-LLM blir ikkje validert mot skjema automatisk.** Output frå `tools/minstevann/` blir manuelt sjekka før upload til R2.
- **Rapport-AI har ikkje rate limit per API-nøkkel ennå.** Cloudflare Worker-rate-limit dekkjer per IP. Per-nøkkel rate limit står på lista.
- **Prompt-injection-mottiltak er konservativ tekst-grense, ikkje reell deteksjon.** `NARRATIVE_MAX_WORDS: 250` reduserer skade om modellen blir leia på avvegar, men oppdagar det ikkje.
- **Ingen sikkerheitsbevis utover designet.** Vi har ikkje køyrt formell pentest.

## Sjå Òg

- Detaljert WAF, secrets, deploy-flyt: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Korleis service binding-flyten er bygd: [arkitektur.md](arkitektur.md)
- Rapport-AI og prompt-strategi: [ai-strategi.md](ai-strategi.md)
