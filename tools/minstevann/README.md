# Minstevann Pipeline

Pipeline som les NVE-konsesjonsdokument og hentar ut minstevannskrav automatisk.

## Bruk

```bash
python run.py plant 1696
python run.py batch --n 50
python run.py preparse
```

Kjor `python run.py <kommando> --help` for full oversikt over flagg og fleire eksempel.

## Krav

- Python 3.13+
- Java 21 JDK, brukt av OpenDataLoader (`JAVA_HOME` ma peike pa Java 21)
- `opendataloader-pdf[hybrid]` (inkluderer Docling og EasyOCR)
- `opendataloader-pdf-hybrid` pa `PATH` for hybrid OCR-server (valfritt)
- LM Studio Local Server pa `http://127.0.0.1:1234`
- LM Studio-modell `gemma-4-E2B-it-Q4_K_M.gguf`, eksponert som API-id `gemma-4-e2b-it`
- NVIDIA GPU er valfritt, men kan gjere OCR/LLM raskare

## Installasjon

Kjor fra repo-rota:

```powershell
python -m pip install -e .\tools\minstevann
```

Dette installerer `opendataloader-pdf[hybrid]`, som inkluderer Docling og EasyOCR for OCR av skanna PDF-ar. `JAVA_HOME` ma peike pa Java 21.

Start LM Studio Local Server. Pipelinen proever aa laste modellen med context length `32768` via LM Studio sitt native model-load API foer foerste kall. Verifiser at serveren svarer:

```bash
GET http://127.0.0.1:1234/v1/models
```

Default modell-id er `gemma-4-e2b-it`. Host kan overstyrast med `--host` eller `HG_LM_STUDIO_HOST`. Dersom LM Studio sin OpenAI-modell-id er eit alias, kan native load-modell overstyrast med `HG_LM_STUDIO_LOAD_MODEL`.

Inference-parametrane er `temperature=0.1`, `top_p=0.95`, `top_k=64`, `min_p=0.0`, `repeat_penalty=1.05`, `max_tokens=4096`, og `stream=false`. Dei kan overstyrast med `HG_LM_STUDIO_*`-miljoevariablar.

## Korleis Pipelinen Fungerer

Pipelinen er NVEID-forst:

1. Tek imot HydroGuide `nveID`.
2. Slar opp stasjonsmetadata fra NVE og hentar `kdbNr` for nedlastinga.
3. Lastar ned konsesjonssaker og PDF-vedlegg fra NVE (HTTP-cache i `.data/http/`).
4. Forehandstolkar nye PDF-ar med OpenDataLoader og klassifiserer dei som `good`, `bad` eller `scanned`.
5. Hentar brukbar tekst fra preparse-cache eller direkte PDF-ekstraksjon, og rangerer vedlegg etter tittel + innhald.
6. Sender relevante utdrag til LM Studio for ekstraksjon av claims.
7. Dersom alle relevante PDF-ar er klassifisert som `needs_hybrid` (skanna), startar pipelinen ein lokal `opendataloader-pdf-hybrid`-server, re-parsar med OCR og prover LM Studio pa nytt.
8. Strukturerer claims til offentleg NVEID-format.
9. Skriv ferdig stasjon direkte til `backend/data/minimumflow.json`.

`minimumflow.json` er sluttresultatet og resume-grunnlaget. Eksisterande NVEID-ar blir hoppa over som standard, og `--force` koyrer dei pa nytt. Cloudflare brukar deretter R2-objektet `api/minimumflow.json` i bucket `hydroguide-minimum-flow`.

## Filer

```text
run.py                  CLI entrypoint
src/
  models.py             Dataklasser og konfigurasjon
  scraper.py            NVE-nedlasting og HTML-parsing
  pdf.py                PDF-ekstraksjon med preparse-cache og fallback
  pdf_preparse.py       Batch-preparse og OCR-handtering
  snippet.py            Relevansfiltrering og nokkelordvindauge
  llm.py                LM Studio-integrasjon og prompt
  assembly.py           Samlar claims til NVEID-format
  minimumflow_db.py     Formaterer og skriv offentleg minimumflow.json
  report.py             Formaterer resultat
tests.py                Einingstestar
.data/                  Lokale cacher, gitignored
```

## Testing

```bash
cd tools/minstevann
python -m unittest tests
```
