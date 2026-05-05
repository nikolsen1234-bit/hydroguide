# Minstevassføring-Pipeline

Pipeline som les NVE-konsesjonsdokument og hentar ut minstevassføringskrav automatisk.

## Bruk

```bash
python run.py plant 1696
python run.py batch --n 50
python run.py preparse
```

Køyr `python run.py <kommando> --help` for fullstendig oversikt over flagg og fleire eksempel.

## Krav

- Python 3.13+
- Java 21 JDK, brukt av OpenDataLoader (`JAVA_HOME` må peike på Java 21)
- `opendataloader-pdf[hybrid]` (inkluderer Docling og EasyOCR)
- `opendataloader-pdf-hybrid` på `PATH` for hybrid OCR-server (valfritt; pipelinen hoppar over hybrid-fasen viss han ikkje er tilgjengeleg)
- Ollama med modellen sett av `DEFAULT_MODEL` i `src/models.py` (default: `gemma4:e4b-it-q4_K_M`). Kan overstyrast med `--model` eller `HG_OLLAMA_HOST` / `HG_OLLAMA_TIMEOUT`.
- NVIDIA GPU er valfritt, men kan gjere OCR/LLM raskare

## Installasjon

Køyr frå repo-rota:

```powershell
python -m pip install -e .\tools\minstevann
```

Dette installerer `opendataloader-pdf[hybrid]`, som inkluderer Docling og EasyOCR for OCR av skanna PDF-ar. `JAVA_HOME` må peike på Java 21.

Ollama må køyre lokalt med modellen lasta ned (byt namn viss du brukar ein annan default i `src/models.py` eller `--model`):

```bash
ollama pull gemma4:e4b-it-q4_K_M
ollama serve
```

## Korleis Pipelinen Fungerer

Pipelinen er NVEID-først:

1. Tek imot HydroGuide `nveID`.
2. Slår opp stasjonsmetadata frå NVE og hentar `kdbNr` for nedlastinga.
3. Lastar ned konsesjonssaker og PDF-vedlegg frå NVE (HTTP-cache i `.data/http/`).
4. Førehandstolkar nye PDF-ar med OpenDataLoader og klassifiserer dei som `good`, `bad` eller `scanned`.
5. Hentar brukbar tekst frå preparse-cache eller direkte PDF-ekstraksjon, og rangerer vedlegg etter tittel + innhald.
6. Sender relevante utdrag til Ollama for ekstraksjon av claims.
7. Dersom alle relevante PDF-ar er klassifisert som `needs_hybrid` (skanna), startar pipelinen ein lokal `opendataloader-pdf-hybrid`-server, re-parsar med OCR og prøver Ollama på nytt.
8. Strukturerer claims til offentleg NVEID-format.
9. Skriv ferdig stasjon direkte til `backend/data/minimumflow.json`.

`minimumflow.json` er sluttresultatet og resume-grunnlaget. Eksisterande NVEID-ar blir hoppa over som standard, og `--force` køyrer dei på nytt. Cloudflare brukar deretter R2-objektet `api/minimumflow.json` i bucket `hydroguide-minimum-flow`.

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
