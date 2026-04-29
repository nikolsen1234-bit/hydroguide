# Minstevannføring-pipeline

Batch-pipeline som leser NVE-konsesjonsdokumenter og henter ut minstevannføringskrav automatisk.

## Bruk

```bash
python run.py plant 1696       # én stasjon
python run.py batch --n 500    # 500 stasjoner
python run.py batch --resume   # fortsett der den stoppet
python run.py export           # skriv til backend/data/minimumflow.json
```

## Dependencies

- Python 3.13+
- Java 21 (JDK, kreves av OpenDataLoader)
- OpenDataLoader PDF (`opendataloader-pdf[hybrid]`)
- Ollama (`gemma4:e4b-it-q4_K_M`)
- NVIDIA GPU (valgfritt)

## Installasjon

```powershell
python -m pip install -e .\tools\minstevann
```

Dette installerer `opendataloader-pdf[hybrid]` som inkluderer Docling og EasyOCR for OCR av skannede PDFer. `JAVA_HOME` må være satt.

Ollama må kjøre lokalt med modellen lastet:

```bash
ollama pull gemma4:e4b-it-q4_K_M
ollama serve
```

## Hvordan pipelinen fungerer

Pipelinen kjører i cycles à 25 stasjoner:

1. Last ned konsesjonssaker og PDF-vedlegg fra NVE
2. Preparse alle PDFer i én OpenDataLoader `convert()`-kall (JSON-format)
3. Digitale PDFer med relevante nøkkelord → filtrert tekst direkte til Ollama
4. Skannede PDFer → hybrid OCR (auto triage, full retry ved dårlig resultat)
5. Ollama leser filtrert tekst og returnerer strukturerte minstevannføringskrav
6. Resultater skrives fortløpende til `run_XXX.json`

## Filer

```
run.py                  CLI entry point
src/
  models.py             Dataklasser og konfigurasjon
  scraper.py            NVE-nedlasting og HTML-parsing
  pdf.py                PDF-ekstraksjon (preparse-cache + fallback)
  pdf_preparse.py       Batch-preparse og OCR-håndtering
  snippet.py            Relevansfiltrering og nøkkelordvindu
  llm.py                Ollama-integrasjon og prompt
  assembly.py           Sammenstilling av claims til NVEID-format
  report.py             Formatering av resultater
tests.py                22 enhetstester
.data/                  Lokale cacher (HTTP, LLM, resultater) — gitignored
```

## Testing

```bash
cd tools/minstevann
python -m unittest tests
```
