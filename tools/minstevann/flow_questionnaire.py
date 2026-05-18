"""
Questionnaire for mapping suitable minimum-flow measurement methods.

The script asks for the facts needed before assessing a measurement arrangement
against NVE Veileder 3/2020. It does not make a final recommendation until the
critical facts are present.

Usage:
    python tools/minstevann/flow_questionnaire.py
    python tools/minstevann/flow_questionnaire.py --non-interactive
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


AnswerMap = dict[str, str]


@dataclass(frozen=True)
class Question:
    key: str
    category: str
    text: str
    options: tuple[str, ...] = ()
    critical: bool = False
    why: str = ""
    ask_if: Callable[[AnswerMap], bool] = lambda _answers: True


@dataclass
class MethodCandidate:
    name: str
    relevant_if: list[str]
    clarify: list[str] = field(default_factory=list)


CATEGORIES = (
    "Utslipp",
    "Måling og stedlige forhold",
    "Dokumentasjon og egnethet",
)


QUESTIONS: tuple[Question, ...] = (
    Question(
        key="release_source",
        category="Utslipp",
        text="Hvor tas minstevannføringen ut fra anlegget?",
        options=("inntaksbasseng", "rør/tapperør", "luke/åpning", "fiskepassasje", "coanda/bypass", "annet/ukjent"),
        critical=True,
        why="NVE 3/2020-vurderingen må starte med hvor vannet faktisk tas ut, ellers vet man ikke hva som skal måles.",
    ),
    Question(
        key="release_return",
        category="Utslipp",
        text="Hvor slippes vannet tilbake i elva?",
        critical=True,
        why="Målepunktet må kunne knyttes til den vannføringen som faktisk slippes forbi inntaket.",
    ),
    Question(
        key="release_type",
        category="Utslipp",
        text="Hvordan slippes vannet fysisk i dag?",
        options=("lukket fullt rør", "delvis fylt rør", "åpen kanal", "overløp/terskel", "luke/åpning", "coanda/bypass", "fiskepassasje", "naturlig løp", "ukjent"),
        critical=True,
        why="Slipptype avgjør om rørmålt flow, vannstand/overløp eller annen metode kan vurderes.",
    ),
    Question(
        key="can_be_closed",
        category="Utslipp",
        text="Kan slippet stenges, strupes eller endres uten at dette blir synlig eller logget?",
        options=("ja", "nei", "ukjent"),
    ),
    Question(
        key="pipe_full",
        category="Måling og stedlige forhold",
        text="Hvis slippet går i rør: er røret alltid fullfylt ved minstevannføring?",
        options=("ja", "nei", "ikke relevant", "ukjent"),
        critical=True,
        why="Elektromagnetisk og mange inline ultralydmålere krever normalt at målerøret er fullt for å gi riktig flow.",
        ask_if=lambda answers: "rør" in answers.get("release_type", ""),
    ),
    Question(
        key="pipe_diameter",
        category="Måling og stedlige forhold",
        text="Hvis rør er relevant: hva er omtrent rørdiameter og materiale?",
        ask_if=lambda answers: "rør" in answers.get("release_type", ""),
    ),
    Question(
        key="straight_run",
        category="Måling og stedlige forhold",
        text="Finnes det nok rett rørstrekk for en inline eller clamp-on flowmåler?",
        options=("ja", "nei", "ukjent", "ikke relevant"),
        ask_if=lambda answers: "rør" in answers.get("release_type", ""),
    ),
    Question(
        key="pipe_access",
        category="Måling og stedlige forhold",
        text="Er røret fysisk tilgjengelig for montering, service og avlesing?",
        options=("ja", "nei", "delvis", "ukjent", "ikke relevant"),
        ask_if=lambda answers: "rør" in answers.get("release_type", ""),
    ),
    Question(
        key="open_control_profile",
        category="Måling og stedlige forhold",
        text="Hvis åpent løp/kanal/overløp er relevant: finnes det et stabilt måletverrsnitt eller kontrollprofil?",
        options=("ja", "nei", "ukjent", "ikke relevant"),
        critical=True,
        why="Vannstandsmåling krever at vannstanden kan kobles til vannføring med en stabil profil eller vannføringskurve.",
        ask_if=lambda answers: any(word in answers.get("release_type", "") for word in ("åpen", "overløp", "terskel", "luke", "fiskepassasje", "naturlig", "coanda")),
    ),
    Question(
        key="level_sensor_type",
        category="Måling og stedlige forhold",
        text="Hvis vannstand er aktuell: hvilken type vannstandsensor passer eller finnes i dag?",
        options=("trykkgiver/neddykket sensor", "radar", "ultralyd nivåsensor", "flottør", "ingen", "ukjent", "ikke relevant"),
        critical=True,
        why="Ved vannstand som måleprinsipp må sensortype og plassering passe lokale forhold som frost, turbulens og vannspeil.",
        ask_if=lambda answers: any(word in answers.get("release_type", "") for word in ("åpen", "overløp", "terskel", "luke", "fiskepassasje", "naturlig", "coanda")),
    ),
    Question(
        key="level_curve",
        category="Måling og stedlige forhold",
        text="Finnes det vannføringskurve, kalibrert overløp/terskel eller annen sammenheng mellom vannstand og flow?",
        options=("ja", "nei", "ukjent", "ikke relevant"),
        critical=True,
        why="Uten dokumentert sammenheng mellom vannstand og vannføring kan vannstand alene ikke dokumentere faktisk minstevannføring.",
        ask_if=lambda answers: any(word in answers.get("release_type", "") for word in ("åpen", "overløp", "terskel", "luke", "fiskepassasje", "naturlig", "coanda")),
    ),
    Question(
        key="measurement_represents_release",
        category="Måling og stedlige forhold",
        text="Måler punktet faktisk sluppet minstevannføring, og ikke produksjonsvannføring eller blandet vann?",
        options=("ja", "nei", "ukjent"),
        critical=True,
        why="NVE 3/2020-forankret vurdering må skille faktisk slipp fra andre vannstrømmer.",
    ),
    Question(
        key="local_disturbances",
        category="Måling og stedlige forhold",
        text="Hvilke stedlige forhold kan påvirke målingen?",
        options=("is/frost", "drivgods/rusk", "sediment", "turbulens", "oppstuving", "flom", "ustabilt vannspeil", "vanskelig tilkomst", "ingen kjent", "ukjent"),
    ),
    Question(
        key="power_comms",
        category="Dokumentasjon og egnethet",
        text="Finnes strømforsyning og kommunikasjon ved målepunktet?",
        options=("strøm og kommunikasjon", "bare strøm", "bare kommunikasjon", "ingen", "ukjent"),
    ),
    Question(
        key="logging",
        category="Dokumentasjon og egnethet",
        text="Logges minstevannføringen kontinuerlig med sikker lagring?",
        options=("ja", "nei", "delvis", "ukjent"),
        critical=True,
        why="Dokumentasjon overfor NVE forutsetter at eier kan vise hva som faktisk er sluppet over tid.",
    ),
    Question(
        key="public_or_nve_check",
        category="Dokumentasjon og egnethet",
        text="Kan NVE eller allmennheten kontrollere vannslippet på stedet der veilederen gjør dette relevant?",
        options=("ja", "nei", "delvis", "ukjent"),
    ),
    Question(
        key="existing_method",
        category="Dokumentasjon og egnethet",
        text="Hvilken målemetode finnes i dag, hvis noen?",
        options=("elektromagnetisk", "inline ultralyd", "clamp-on ultralyd", "vannstand + kurve", "visuell avlesing", "ingen", "annet/ukjent"),
    ),
)


METHOD_CANDIDATES = (
    MethodCandidate(
        name="Elektromagnetisk mengdemåler",
        relevant_if=[
            "slippet går i lukket rør",
            "røret er fullfylt ved minstevannføring",
            "det finnes egnet rettstrekk og tilgang",
        ],
        clarify=[
            "rør er fullfylt",
            "rørdiameter/materiale",
            "rettstrekk",
            "frostsikring og serviceadkomst",
        ],
    ),
    MethodCandidate(
        name="Inline ultralyd mengdemåler",
        relevant_if=[
            "slippet går i lukket rør",
            "røret er fullfylt eller metoden er godkjent for aktuell fyllingsgrad",
            "rørforholdene gir stabilt målebilde",
        ],
        clarify=[
            "fullfylt rør",
            "rørmateriale og diameter",
            "rettstrekk og turbulens",
        ],
    ),
    MethodCandidate(
        name="Clamp-on ultralyd",
        relevant_if=[
            "røret er tilgjengelig uten inngrep",
            "rørmateriale, diameter og veggtykkelse er kjent",
            "flowprofilen er stabil nok",
        ],
        clarify=[
            "rørtilgang",
            "rørmateriale",
            "rettstrekk",
            "om metoden er egnet for lav minstevannføring",
        ],
    ),
    MethodCandidate(
        name="Vannstand + overløp/terskel/vannføringskurve",
        relevant_if=[
            "slippet skjer i åpent løp, kanal, overløp, terskel, fiskepassasje eller bypass",
            "det finnes stabil kontrollprofil",
            "vannstand kan oversettes til vannføring",
        ],
        clarify=[
            "kontrollprofil",
            "vannføringskurve eller kalibrert overløp",
            "type vannstandsensor: trykkgiver, radar eller ultralyd nivåsensor",
            "is, frost, turbulens, oppstuving og sediment",
        ],
    ),
)


def ask(question: Question) -> str:
    print(f"\n[{question.category}]")
    if question.critical:
        print("Kritisk:", question.why)
    print(question.text)
    if question.options:
        for index, option in enumerate(question.options, start=1):
            print(f"  {index}. {option}")

    while True:
        raw = input("> ").lstrip("\ufeff").strip()
        if not raw:
            print("Skriv et kort svar, eller velg nummer.")
            continue
        if question.options and raw.isdigit():
            selected = int(raw)
            if 1 <= selected <= len(question.options):
                return question.options[selected - 1]
        return raw


def collect_answers(non_interactive: bool) -> AnswerMap:
    answers: AnswerMap = {}
    for question in QUESTIONS:
        if not question.ask_if(answers):
            answers[question.key] = "ikke relevant"
            continue
        if non_interactive:
            answers[question.key] = ""
        else:
            answers[question.key] = ask(question)
    return answers


def is_missing(answer: str) -> bool:
    normalized = answer.strip().lower()
    return normalized in {"", "ukjent", "annet/ukjent"}


def critical_missing(answers: AnswerMap) -> list[Question]:
    missing: list[Question] = []
    for question in QUESTIONS:
        if question.critical and question.ask_if(answers) and is_missing(answers.get(question.key, "")):
            missing.append(question)
    return missing


def matching_method_notes(answers: AnswerMap) -> list[str]:
    release_type = answers.get("release_type", "").lower()
    notes: list[str] = []

    if "rør" in release_type:
        pipe_full = answers.get("pipe_full", "").lower()
        if pipe_full == "ja":
            notes.append("Rørbaserte kandidater kan kartlegges videre: elektromagnetisk, inline ultralyd og eventuelt clamp-on ultralyd.")
        elif pipe_full in {"nei", "ukjent", ""}:
            notes.append("Rør er relevant, men fullfylt rør må avklares for elektromagnetisk og mange ultralydløsninger.")

    if any(word in release_type for word in ("åpen", "overløp", "terskel", "luke", "fiskepassasje", "naturlig", "coanda")):
        notes.append("Vannstandbasert metode kan kartlegges videre, inkludert sensortype: trykkgiver, radar eller ultralyd nivåsensor.")

    if answers.get("measurement_represents_release", "").lower() == "nei":
        notes.append("Eksisterende målepunkt ser ikke ut til å representere faktisk sluppet minstevannføring; nytt målepunkt må avklares for vurdering.")

    return notes


def print_questions_only() -> None:
    for category in CATEGORIES:
        print(f"\n## {category}")
        for question in QUESTIONS:
            if question.category != category:
                continue
            marker = " [KRITISK]" if question.critical else ""
            print(f"-{marker} {question.text}")
            if question.critical:
                print(f"  Hvorfor: {question.why}")


def print_summary(answers: AnswerMap) -> None:
    missing = critical_missing(answers)

    print("\n# Oppsummering")
    print("Dette er kartlegging for å vurdere egnet flowmålingsmetode etter NVE Veileder 3/2020.")
    print("Instrumentering for 5-årige kontrollmålinger er ikke gjort til eget tema.")

    print("\n## Svar")
    for question in QUESTIONS:
        answer = answers.get(question.key, "")
        if answer == "ikke relevant":
            continue
        print(f"- {question.category}: {question.text} {answer or '(ikke besvart)'}")

    print("\n## Kritiske avklaringer")
    if not missing:
        print("- Ingen kritiske spørsmål mangler i denne kartleggingen.")
    else:
        for question in missing:
            print(f"- {question.text}")
            print(f"  Hvorfor: {question.why}")

    print("\n## Metodekandidater å kartlegge videre")
    notes = matching_method_notes(answers)
    if notes:
        for note in notes:
            print(f"- {note}")
    else:
        print("- Kan ikke snevres inn før slipptype og kritiske avklaringer er besvart.")

    print("\n## Metodefamilier og fakta som må avklares")
    for method in METHOD_CANDIDATES:
        print(f"- {method.name}")
        print(f"  Relevant når: {'; '.join(method.relevant_if)}.")
        print(f"  Avklar: {'; '.join(method.clarify)}.")

    if missing:
        print("\nKonklusjon: Ikke lag endelig vurdering eller anbefaling før de kritiske spørsmålene er besvart.")
    else:
        print("\nKonklusjon: Kritiske inngangsdata er kartlagt. Neste steg er faglig vurdering av egnet metode mot NVE 3/2020 og stedlige forhold.")


def save_answers(path: Path, answers: AnswerMap) -> None:
    payload = {
        "purpose": "Kartlegging av egnet type flowmålingsmetode for minstevannføring.",
        "source_basis": "NVE Veileder 3/2020",
        "ignore_scope": "Instrumentering for 5-årige kontrollmålinger er ignorert med mindre bruker ber om det.",
        "answers": answers,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Still NVE 3/2020-baserte spørsmål for å kartlegge egnet flowmålingsmetode for minstevannføring.",
    )
    parser.add_argument(
        "--questions-only",
        action="store_true",
        help="Skriv bare spørsmålene, uten interaktiv utfylling.",
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        help="Skriv oppsummering med tomme svar. Nyttig for a se struktur.",
    )
    parser.add_argument(
        "--save-json",
        type=Path,
        help="Lagre svarene som JSON til angitt fil.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.questions_only:
        print_questions_only()
        return 0

    answers = collect_answers(non_interactive=args.non_interactive)
    print_summary(answers)

    if args.save_json:
        save_answers(args.save_json, answers)
        print(f"\nLagret JSON: {args.save_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
