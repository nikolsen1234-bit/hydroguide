# AI-Dokumentasjon

Oppdatert: 2026-05-03

HydroGuide har to AI-relaterte delar:

1. Rapport-AI i Cloudflare, brukt når nettsida lagar rapporttekst.
2. Lokal minstevassføring-pipeline, brukt til å hente krav frå NVE-dokument.

## Rapport-AI I Cloudflare

```text
Frontend
  POST /api/report
    -> hydroguide-report
       - rate limit
       - sjekkar REPORT_ACCESS_CODE_HASH
       - sender vidare med REPORT_WORKER_TOKEN
       -> REPORT_AI_WORKER service binding
          -> hydroguide-ai
             - hentar reglar og referansar
             - byggjer prompt
             - kallar modell via AI Gateway
             - returnerer { text }
```

`hydroguide-ai` har ingen offentleg route. `hydroguide-report` kallar han med service binding.

## Rapport-Bindingar

| Binding | Type | Bruk |
|---------|------|------|
| `REPORT_AI_WORKER` | Service binding | Internt kall frå report Worker til AI Worker |
| `REPORT_ACCESS_CODE_HASH` | Secret | Tilgangskode frå nettsida |
| `REPORT_WORKER_TOKEN` | Secret | Intern bearer mellom report og AI |
| `REPORT_RULES` | KV | Rapportreglar og faste NVE-utdrag |
| `AI_REFERENCE_BUCKET` | R2 | Referansar og embeddings |
| `AI_GATEWAY_AUTH_TOKEN` | Secret | Tilgang til AI Gateway |
| `AI_SEARCH_API_TOKEN` | Secret | Tilgang til AI Search |

## Retrieval

Rapport-AI hentar grunnlag frå:

- `REPORT_RULES` for faste reglar og korte utdrag.
- `AI_REFERENCE_BUCKET` for NVE-referansar og embeddings.
- AI Search / AutoRAG med `AI_SEARCH_*`-konfig.

## Modell

Standard config brukar:

- Primærmodell: `gpt-5.1`
- Fallback: `gpt-5.4-mini`
- AI Gateway med cache, retry og timeout

## Lokal Minstevassføring-Pipeline

Pipeline ligg i `tools/minstevann/` og køyrer lokalt:

```text
NVE ArcGIS
  -> konsesjonsdokument/PDF
  -> tekstuttrekk og OCR
  -> relevante minstevassføring-setningar
  -> LLM-strukturering
  -> backend/data/minimumflow.json
  -> R2: hydroguide-minimum-flow
```

Cloudflare brukar ferdig resultat frå R2. PDF/OCR/LLM-batchen køyrer lokalt i `tools/minstevann/`.
