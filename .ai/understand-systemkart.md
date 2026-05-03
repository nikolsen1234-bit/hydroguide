# HydroGuide Internt Systemkart

Oppdatert: 2026-05-03

Dette er eit internt datakart for agentar og Understand Anything. Det skal ikkje publiserast eller lenkast frå offentleg dokumentasjon. Kartet skil mellom runtime, lokal datafabrikk og verktøydata.

Understand Anything skal bruke `.understand-anything/.understandignore` slik at lokale caches, private Cloudflare-filer og genererte deploy-configs ikkje blir del av grafen.

## Kortkart

```text
Brukar
  -> hydroguide.no frontend
     -> hydroguide-api
     -> hydroguide-report
        -> hydroguide-ai

Operator
  -> hydroguide-admin

Lokal minstevassføring-pipeline
  -> backend/data/minimumflow.json
  -> R2: hydroguide-minimum-flow/api/minimumflow.json
  -> hydroguide-api /api/nveid
```

## Cloudflare-Runtime

| Del | Rolle | Offentleg |
|-----|-------|-----------|
| `hydroguide-api` | Rekning, NVEID, PVGIS TMY, stadforslag, terrengprofil og API-docs | Ja, under `/api/*` |
| `hydroguide-report` | Tek imot rapportkall frå frontend og kallar AI Worker internt | Ja, berre `/api/report` |
| `hydroguide-ai` | Byggjer rapporttekst med reglar, referansar og AI Gateway | Nei |
| `hydroguide-admin` | API-nøkkeladministrasjon | Ja, under `/admin/*` |

`hydroguide-ai` er intern runtime. Han skal ikkje teiknast som eit offentleg API.

## Minstevassføring

```text
NVE ArcGIS
  -> konsesjonsdokument og PDF-ar
  -> tekstuttrekk, OCR og relevante utdrag
  -> lokal LLM-strukturering
  -> samanstilling per NVEID
  -> backend/data/minimumflow.json
  -> R2
  -> /api/nveid/{nveID}/minimum-flow
```

`tools/minstevann/` i dette repoet er den spora modulære datafabrikken. Lokal iterativ verifikasjon og fasit-arbeid kan ligge i `hydroguide-workspace/tools/minstevann/`, men det høyrer ikkje til Cloudflare-runtimekartet.

## Kva Grafar Skal Ta Med

| Kart | Ta med | Hald utanfor |
|------|--------|--------------|
| Runtime | `frontend/`, `backend/api/`, `backend/workers/`, `backend/services/`, `backend/scripts/` | `.ai/`, `.understand-anything/`, caches, generated wrangler-configs, private config |
| Minstevassføring | `tools/minstevann/run.py`, `tools/minstevann/src/`, `tools/minstevann/README.md`, `backend/api/nveid.js`, `backend/data/minimumflow.json` | `tools/minstevann/.data/`, OCR-cache, LLM-cache, lokale run-resultat |
| Cloudflare | `backend/workers/`, `backend/cloudflare/*.jsonc`, `backend/scripts/`, `.github/workflows/cloudflare-workers.yml` | `backend/cloudflare/*.generated.wrangler.jsonc`, `backend/config/cloudflare.private.json`, `.secrets` |

Når eit automatisk kart blir meir komplisert enn dette, skal agenten bruke dette interne kartet som fasit og berre utvide med konkrete filreferansar.
