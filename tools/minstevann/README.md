# Minstevassføring-Pipeline

Batch-pipeline som les NVE-konsesjonsdokument og hentar ut minstevassføringskrav automatisk.

## Bruk

```bash
python run.py plant 1696       # éin stasjon
python run.py batch --n 500    # 500 stasjonar
python run.py batch --resume   # fortset der køyringa stoppa
python run.py export           # skriv til backend/data/minimumflow.json
```

## Krav

- Python 3.13+
- Java 21 JDK, brukt av OpenDataLoader
- `opendataloader-pdf[hybrid]`
- Ollama med modellen `gemma4:e4b-it-q4_K_M`
- NVIDIA GPU er valfritt, men kan gjere OCR/LLM raskare

## Installasjon

Køyr frå repo-rota:

```powershell
python -m pip install -e .\tools\minstevann
```

Dette installerer `opendataloader-pdf[hybrid]`, som inkluderer Docling og EasyOCR for OCR av skanna PDF-ar. `JAVA_HOME` må peike på Java 21.

Ollama må køyre lokalt med modellen lasta ned:

```bash
ollama pull gemma4:e4b-it-q4_K_M
ollama serve
```

## Korleis Pipelinen Fungerer

Pipelinen køyrer i bolkar:

1. Lastar ned konsesjonssaker og PDF-vedlegg frå NVE.
2. Preparser PDF-ar med OpenDataLoader `convert()` i JSON-format.
3. Filtrerer digitale PDF-ar med relevante nøkkelord før LLM-kall.
4. Køyrer hybrid OCR på skanna PDF-ar.
5. Sender relevante utdrag til Ollama.
6. Strukturerer funn til NVEID-format.
7. Skriv resultat fortløpande til lokale `run_*.json`-filer.

Eksporten skriv den aktive lokale databasen til `backend/data/minimumflow.json`. Cloudflare brukar deretter R2-objektet `api/minimumflow.json` i bucket `hydroguide-minimum-flow`.

## Filer

```text
run.py                  CLI entrypoint
src/
  models.py             Dataklasser og konfigurasjon
  scraper.py            NVE-nedlasting og HTML-parsing
  pdf.py                PDF-ekstraksjon med preparse-cache og fallback
  pdf_preparse.py       Batch-preparse og OCR-handtering
  snippet.py            Relevansfiltrering og nøkkelordvindauge
  llm.py                Ollama-integrasjon og prompt
  assembly.py           Samlar claims til NVEID-format
  report.py             Formaterer resultat
tests.py                Einingstestar
.data/                  Lokale cacher, gitignored
```

## Testing

```bash
cd tools/minstevann
python -m unittest tests
```
