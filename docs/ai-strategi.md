# AI-Strategi

Oppdatert: 2026-05-03

Dette dokumentet svarar på "kvifor brukar HydroGuide AI i det heile, og korleis hindrar vi at det går gale". Konkret runtime-konfig finst i [ai-rapport.md](ai-rapport.md).

## Kvifor LLM I Det Heile

LLM blir brukt to stader:

1. **Rapport-AI (runtime).** Genererer den lesbare delen av rapporten — forklarar val og anbefalingar i klart språk.
2. **Pipeline (offline).** Strukturerer NVE-konsesjonsdokument til JSON med minstevassføringskrav.

For begge gjeld: regelmotorane (recommendation, calculation core, NVE-vilkår) er deterministiske. AI er supplement — han skriv klartekst og hjelper å hente struktur ut av PDF — han tek ikkje avgjerder.

## Kva Vi Ikkje Bruker LLM Til

For å vere tydelege:

- LLM **rår ikkje** kva slepp-løysing brukaren skal velje. Det gjer `recommendation.ts`.
- LLM **rår ikkje** energibalanse eller batterikapasitet. Det gjer `systemResults.ts` og `batterySimulator.ts`.
- LLM **rår ikkje** kva minstevassføring eit kraftverk har. Det er fakta frå NVE-PDF, lagra deterministisk i `minimumflow.json`.

LLM lagar tekst rundt resultat; LLM produserer ikkje resultat.

## Korleis Vi Hindrar Hallusinering

| Mottiltak | Korleis |
|-----------|---------|
| Faste utdrag i `REPORT_RULES` | Faste, redigerte tekstbitar som modellen *skal* støtte seg på framfor å improvisere |
| `NARRATIVE_MODE: supplement` | Eksplisitt at modellen skal supplere, ikkje erstatte |
| `NARRATIVE_MAX_WORDS: 250` | Kort tekst gjev mindre rom for å vandre vekk |
| `NARRATIVE_MAX_SENTENCES: 10` | Hard struktur-grense |
| Retrieval med threshold | `AI_SEARCH_MATCH_THRESHOLD: 0.35` — kuttar svake treff |
| `AI_SEARCH_ENABLE_QUERY_REWRITE: false` | Vi vil ikkje at modellen skal omformulere brukarspørsmålet før retrieval |
| Reranking på | `AI_SEARCH_ENABLE_RERANKING: true` — best-match-treff først |
| Modell-fallback | `gpt-5.4-mini` om primærmodell feilar — vi får alltid eit svar, ikkje ein fantasi-tekst |

## Korleis Vi Hindrar Prompt-Injection

NVE-tekst går inn i prompten. Brukar-input går inn i prompten. Begge er angrepsvektorar.

| Mottiltak | Korleis |
|-----------|---------|
| `ALLOWED_ORIGINS` på AI-Workeren | Berre `hydroguide.no` og lokal dev kan i det heile kalle Workeren |
| `REPORT_ACCESS_CODE_HASH` | Validerar at kallet kjem frå nettsida, ikkje direkte |
| Service binding | AI-Worker har ingen offentleg URL — direkte kall er ikkje mogleg |
| Klare seksjonsmarkørar i prompten | NVE-tekst og brukar-input ligg i tydelege blokker, ikkje blanda inn i instruksjonen |
| Kort output-grense | Sjølv om modellen blir leia på avvegar, kan han ikkje skrive 5000 ord med skadeleg tekst |

Vi har **ikkje** ein automatisk prompt-injection-detektor. Det er ein kjent avgrensing — sjå [sikkerheit.md](sikkerheit.md).

## Kostnad Og Latens

AI-Gateway gjev oss tre verktøy:

1. **Cache** (TTL 3600s). Same input → cache-treff → ingen modell-kall. Kostnad 0, latens ~50ms.
2. **Retry med eksponensiell backoff.** Inntil 3 forsøk, 500ms initial delay.
3. **Timeout** på 8000ms. Vi blokkerer ikkje brukaren i meir enn 8 sekund per forsøk.

For ein typisk rapport (under 250 ord, primærmodell `gpt-5.1`) er kostnaden i størrelsesorden eit par øre per request før cache. Med cache-treff på like rapportar fell det vidare.

Vi måler i Cloudflare AI Gateway-dashbordet:
- Cache-treff-prosent
- Gjennomsnittleg latens
- Kostnad per dag/månad
- Modell-fordeling (primær vs fallback)

## Kvifor AI Search Og Ikkje Vectorize

Vi har `VECTORIZE_ENABLED: false`. Grunn:

- AI Search (AutoRAG-stil) er ferdig oppsett: gir oss embedding, lagring, søk og reranking i éin teneste.
- Vectorize krev at vi byggjer embeddings sjølv, vedlikeheld dei, og handterer relevans-scoring.
- For ~600 NVEID-ar og statisk korpus er AI Search billegare i tid og pengar.

Hadde korpus vakse til mange tusen dynamiske dokument med ofte oppdaterte embeddings, ville Vectorize blitt aktuelt.

## Kvifor Self-feedback Og User-feedback Er Av

`SELF_FEEDBACK_ENABLED: false` og `USER_FEEDBACK_ENABLED: false`. Grunn:

- **Self-feedback** (modellen vurderer eigen output) er svært dyrt — kostar nesten dobbelt så mykje per request — og gir liten verdiauke når output allereie er <250 ord og bygd på faste reglar.
- **User-feedback** (samle "var dette nyttig?") krev ein tilbakemeldingssløyfe og lagring vi ikkje har designa for. Det blir aktuelt i ein seinare versjon.

Begge er deaktivert via config-flagg, ikkje via fjerning frå kode. Lett å snu på ved behov.

## Kvifor Pipeline Er Lokal, Ikkje Worker

Pipeline-en (`tools/minstevann/`) køyrer lokalt med Java 21, Python 3.13, Ollama og OpenDataLoader.

Grunn:

- OCR + LLM-strukturering tek minutt per dokument. Cloudflare Workers har 30s CPU-grense per request.
- Modellen vi brukar lokalt (`gemma4:e4b-it-q4_K_M` via Ollama) er mykje billegare per kall enn Cloudflare AI Gateway, og dette er batch-køyring der latens ikkje betyr noko.
- Output er statisk JSON som blir lasta opp éin gong til R2. Ingen grunn til å re-prosessere på request-tid.

Pipeline-køyring og output-validering: [tools/minstevann/README.md](../tools/minstevann/README.md).

## Kjende Avgrensingar

Sjå [sikkerheit.md#kjende-avgrensingar](sikkerheit.md#kjende-avgrensingar) for full liste. Spesifikt for AI:

- Pipeline-output blir manuelt sjekka, ikkje automatisk validert mot skjema.
- Vi har ingen prompt-injection-detektor, berre tekstgrense-mottiltak.
- Per-API-nøkkel rate limit på rapport-AI er ikkje på plass — berre Cloudflare per-IP rate limit.

## Sjå Òg

- Runtime-konfig og bindingar: [ai-rapport.md](ai-rapport.md)
- Pipeline-detaljar: [tools/minstevann/README.md](../tools/minstevann/README.md)
- Trusselbilete (prompt-injection, AI-misbruk): [sikkerheit.md](sikkerheit.md)
- Worker-deploy og secrets: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
