# Minstevassføring-Pipeline

Pipeline som les NVE-konsesjonsdokument og hentar ut minstevassføringskrav automatisk.

## Bruk

```bash
python run.py plant 1696             # køyr og lagrar éin NVEID
python run.py plant 1696 --force     # køyr på nytt og overskriv
python run.py batch --n 500          # køyr 500 NVEID-ar
python run.py batch --n 500 --force  # tillat overskriving av eksisterande treff
python run.py preparse               # valfri førehandstolking av cache-PDF-ar
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

Pipelinen er NVEID-først:

1. Tek imot HydroGuide `nveID`.
2. Slår opp stasjonsmetadata frå NVE og brukar `kdbNr` berre der NVE-oppslaget krev det.
3. Lastar ned konsesjonssaker og PDF-vedlegg frå NVE.
4. Hentar brukbar tekst frå preparse-cache, direkte PDF-ekstraksjon eller hybrid OCR.
5. Sender relevante utdrag til Ollama.
6. Strukturerer funn til offentleg NVEID-format.
7. Skriv ferdig stasjon direkte til `backend/data/minimumflow.json`.

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
