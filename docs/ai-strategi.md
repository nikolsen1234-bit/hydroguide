# KI-strategi

Oppdatert: 2026-05-03

Dette dokumentet forklarer hvor HydroGuide bruker KI, hva KI-en gjør, og hvilke begrensninger som gjelder. Det tekniske oppsettet for rapportagenten finnes i [../tools/agent-bridge/README.md](../tools/agent-bridge/README.md).

## Prinsipp for KI i HydroGuide

KI brukes ikke til å:

1. Velge anbefalt løsning
2. Gjøre beregninger
3. Avgjøre om NVE-krav er oppfylt

Valgene i HydroGuide behandles som boolske valg, altså ja/nei-valg. Det betyr at samme input alltid gir samme output.

## KI-bruk

HydroGuide bruker KI to steder:

1. **Rapportagent.** Rapportagenten skriver tekst til rapporten basert på systemvalget fra HydroGuide. Qwen embeddings henter relevante kunnskapschunker fra lokal JSONL, og Codex via CLIProxyAPI skriver et kort, validert rapporttillegg.

2. **Minstevannføring-KI.** Dette er en lokal KI-modell som leser konsesjonsdokumenter fra NVEs nettsider og finner relevante dokumenter til databasen. Informasjonen lagres i en egen database, og denne prosessen kjøres én gang i måneden.

## Flyt

```mermaid
flowchart TD
    A[Bruker svarer på spørsmål<br/>om lokale forhold og utstyrskrav]
    B[HydroGuide samler svar,<br/>NVE-data og relevante tall]
    C[Regelbasert kode gjør beregninger<br/>og finner anbefalt løsning]

    D[KI skriver forklarende rapporttekst]

    E[Rapport settes sammen:<br/>tallgrunnlag + KI-tekst]
    F[Ferdig rapport generert]

    G[Kunnskapsdatabase<br/>fra NVE-dokumenter]
    H[Skriveregler for<br/>KI-rapporten]

    A --> B
    B --> C

    C --> E
    C --> D

    G --> D
    H --> D

    D --> E
    E --> F
