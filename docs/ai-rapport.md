# Rapport-AI (Runtime)

Oppdatert: 2026-05-03

Rapport-AI er den AI-baserte tekstgenereringa som køyrer i Cloudflare når nettsida ber om ein rapport. Han er bygd opp av to Workers, fire bindingar og eitt eksternt LLM-kall via Cloudflare AI Gateway.

For overordna AI-strategi (kvifor LLM, korleis vi unngår at modellen finn på ting, kostnad): sjå [ai-strategi.md](ai-strategi.md).
For pipeline som førebur grunnlagsdata: sjå [tools/minstevann/README.md](../tools/minstevann/README.md).

## Flyt

```text
Frontend
  POST /api/report (REPORT_ACCESS_CODE_HASH)
    -> hydroguide-report
       - rate limit
       - validerer REPORT_ACCESS_CODE_HASH
       - sender vidare med REPORT_WORKER_TOKEN
       -> REPORT_AI_WORKER service binding
          -> hydroguide-ai
             - hentar reglar frå REPORT_RULES
             - hentar referansar frå AI_REFERENCE_BUCKET (via AI Search)
             - byggjer prompt
             - kallar modell via AI Gateway
             - returnerer { text }
```

`hydroguide-ai` har ingen offentleg route. `hydroguide-report` kallar han med service binding.

## Bindingar

| Binding | Type | Bruk |
|---------|------|------|
| `REPORT_AI_WORKER` | Service binding | Internt kall frå `hydroguide-report` til `hydroguide-ai` |
| `REPORT_ACCESS_CODE_HASH` | Secret | Tilgangskode frå nettsida til report-Worker |
| `REPORT_WORKER_TOKEN` | Secret | Intern bearer mellom report og AI |
| `AI` | Cloudflare AI binding | Native Workers AI-tilgang (`remote: true`) |
| `REPORT_RULES` | KV | Rapportreglar og faste NVE-utdrag |
| `AI_REFERENCE_BUCKET` | R2 | Referansar og embeddings |
| `AI_GATEWAY_AUTH_TOKEN` | Secret | Tilgang til AI Gateway |
| `AI_SEARCH_API_TOKEN` | Secret | Tilgang til AI Search |

## Retrieval

Rapport-AI hentar grunnlag frå tre kjelder, i stigande rekkefølgje av "fastheit":

1. **`REPORT_RULES` KV** — faste reglar og korte utdrag som *alltid* skal vere med. Dette er den mest tillitfulle kjelda.
2. **`AI_REFERENCE_BUCKET` R2 via AI Search** — NVE-referansar og embeddings. AI Search returnerer dei mest relevante chunkane for kvar førespurnad.
3. **Direkte konfig-verdiar** frå brukar-input som blir slept inn i prompten med klare avgrensingar.

Retrieval-konfig (frå `backend/cloudflare/ai.wrangler.jsonc`):

```text
RETRIEVAL_BACKEND        auto
RETRIEVAL_STRATEGY       auto
AI_SEARCH_INSTANCE       ai-search
AI_SEARCH_MAX_RESULTS    10
AI_SEARCH_MATCH_THRESHOLD 0.35
AI_SEARCH_ENABLE_RERANKING true
AI_SEARCH_ENABLE_QUERY_REWRITE false
```

Reranking er på, query-rewrite er av — modellen skal ikkje omformulere brukar-spørsmål inn i retrieval-laget.

## Modell

Standard config:

| Verdi | Innstilling |
|-------|-------------|
| Primærmodell | `gpt-5.1` |
| Fallback | `gpt-5.4-mini` |
| AI Gateway ID | `hydroguide-ai-gateway` |
| Cache TTL | 3600 sekund |
| Request timeout | 8000 ms |
| Max attempts | 3 |
| Retry delay | 500 ms (eksponensiell backoff) |

Cache TTL på 1 time gir billege treff på like rapportar (same NVEID, same input).

## Tekstgenereringsbegrensningar

For å hindre at modellen "finn på" eller skriv lange essay:

| Verdi | Innstilling |
|-------|-------------|
| `NARRATIVE_MODE` | `supplement` (skal *supplere* faste reglar, ikkje erstatte) |
| `NARRATIVE_MAX_WORDS` | 250 |
| `NARRATIVE_MAX_SENTENCES` | 10 |

Detaljert grunngjeving: [ai-strategi.md](ai-strategi.md).

## ALLOWED_ORIGINS

Rapport-AI godtar kall berre frå:

- `https://hydroguide.no`
- `https://www.hydroguide.no`
- `http://127.0.0.1:5173`, `http://localhost:5173` (lokal dev)

Dette er ekstra bekreftelse på toppen av service binding (som hindrar offentlege HTTP-kall heilt).

## Kva Ikkje Er På

| Funksjon | Status |
|----------|--------|
| `SELF_FEEDBACK_ENABLED` | false — modellen vurderer ikkje sin eigen output |
| `USER_FEEDBACK_ENABLED` | false — vi tek ikkje brukar-tilbakemelding inn i loop |
| `VECTORIZE_ENABLED` | false — vi brukar AI Search, ikkje Vectorize |

Desse er bevisst slegne av. Sjå [ai-strategi.md](ai-strategi.md) for kvifor.

## Sjå Òg

- AI-strategi (hallusinering, kostnad, prompt-mønster): [ai-strategi.md](ai-strategi.md)
- Pipeline som genererer NVE-data: [tools/minstevann/README.md](../tools/minstevann/README.md)
- Endepunkt og handler: [backend-dokumentasjon.md](backend-dokumentasjon.md)
- Worker-konfig og deploy: [cloudflare-dokumentasjon.md](cloudflare-dokumentasjon.md)
- Trusselbilete (prompt-injection osv.): [sikkerheit.md](sikkerheit.md)
