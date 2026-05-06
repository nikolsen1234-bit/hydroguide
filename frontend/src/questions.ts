import type { TranslationKey } from "./i18n";
import { Answers } from "./types";

interface Option<T extends string> {
  value: T;
  label: string;
  labelKey?: TranslationKey;
}

export interface Question<T extends keyof Answers = keyof Answers> {
  key: T;
  label: string;
  labelKey?: TranslationKey;
  helper?: string;
  helperKey?: TranslationKey;
  unit?: string;
  unitKey?: TranslationKey;
  input: "jaNei" | "select" | "number";
  options?: Option<string>[];
  hidden?: boolean;
  condition?: (answers: Answers) => boolean;
}

export interface QuestionSection {
  title: string;
  titleKey?: TranslationKey;
  questions: Question[];
}

const JA_NEI_OPTIONS: Option<"ja" | "nei">[] = [
  { value: "ja", label: "Ja", labelKey: "questions.option.yes" },
  { value: "nei", label: "Nei", labelKey: "questions.option.no" }
];

export const sections: QuestionSection[] = [
  {
    title: "Anlegg og slipp",
    titleKey: "questions.section.facilityAndRelease",
    questions: [
      {
        key: "q1Anleggstype",
        label: "1. Er anlegget nytt, eksisterende eller en ombygging?",
        labelKey: "questions.q1",
        input: "select",
        options: [
          { value: "nytt", label: "Nytt", labelKey: "questions.option.new" },
          { value: "eksisterande", label: "Eksisterende", labelKey: "questions.option.existing" },
          { value: "ombygging", label: "Ombygging", labelKey: "questions.option.conversion" }
        ]
      },
      {
        key: "q2HogasteMinstevassforing",
        label: "2. Hvor stor er høyeste pålagte minstevannføring?",
        labelKey: "questions.q2",
        unit: "l/s",
        unitKey: "questions.unit.lps",
        input: "number"
      },
      {
        key: "q3Slippkravvariasjon",
        label: "3. Hvordan varierer slippkravet over året?",
        labelKey: "questions.q3",
        input: "select",
        options: [
          { value: "fast", label: "Fast minstevannføring", labelKey: "questions.option.fixedMinFlow" },
          { value: "sesongkrav", label: "Sesongkrav", labelKey: "questions.option.seasonalReq" },
          { value: "tilsigsstyrt", label: "Tilsigsstyrt minstevannføring", labelKey: "questions.option.inflowControlled" }
        ]
      },
      {
        key: "q4Slippmetode",
        label: "4. Hvor og hvordan slippes minstevannføringen?",
        labelKey: "questions.q4",
        helper: "Valget avgjør hovedløsningen for slipp og måling.",
        helperKey: "questions.q4.helper",
        input: "select",
        options: [
          { value: "royr_frostfritt", label: "Gjennom rør i frostfritt rom etter varegrind", labelKey: "questions.option.pipeInFrostFreeRoom" },
          { value: "royr_utan_frostfritt", label: "Gjennom rør i dam uten frostfritt rom", labelKey: "questions.option.pipeThroughDamNoFrost" },
          { value: "luke_utsparing_overloep", label: "Over luke, utsparing eller overløp", labelKey: "questions.option.gateWeirOverflow" },
          { value: "direkte_elveleie", label: "Direkte i elveleie (elvinntak)", labelKey: "questions.option.directRiverRelease" }
        ]
      }
    ]
  },
  {
    title: "Miljø og drift",
    titleKey: "questions.section.environmentAndOperation",
    questions: [
      {
        key: "q5IsSedimentTilstopping",
        label: "5. Er anlegget utsett for is, drivgods, sediment eller tilstopping?",
        labelKey: "questions.q5",
        input: "jaNei",
        options: JA_NEI_OPTIONS
      },
      {
        key: "q6Fiskepassasje",
        label: "6. Har anlegget krav om fiskepassasje?",
        labelKey: "questions.q6",
        input: "jaNei",
        options: JA_NEI_OPTIONS
      },
      {
        key: "q7BypassVedDriftsstans",
        label: "7. Må tilsiget slippes forbi når kraftverket ikke er i drift?",
        labelKey: "questions.q7",
        input: "jaNei",
        options: JA_NEI_OPTIONS
      }
    ]
  },
  {
    title: "Måling og kontroll",
    titleKey: "questions.section.measurementAndControl",
    questions: [
      {
        key: "q8Maleprofil",
        label: "8. Finnes det en egnet måleprofil nedstrøms slippstedet?",
        labelKey: "questions.q8",
        input: "select",
        options: [
          { value: "naturleg_stabilt", label: "Ja, naturlig stabil profil", labelKey: "questions.option.naturalStableProfile" },
          { value: "kan_byggjast_kunstig", label: "Nei, men kan bygges kunstig", labelKey: "questions.option.canBuildArtificial" },
          { value: "ingen_eigna_profil", label: "Nei, ingen egnet profil", labelKey: "questions.option.noSuitableProfile" }
        ]
      },
      {
        key: "q9AllmentaKontroll",
        label: "9. Skal allmennheten kunne kontrollere minstevannføringen på stedet?",
        labelKey: "questions.q9",
        input: "jaNei",
        options: JA_NEI_OPTIONS
      }
    ]
  }
];
