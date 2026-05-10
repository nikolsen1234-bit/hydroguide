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
  input: "yesNo" | "select" | "number";
  options?: Option<string>[];
  hidden?: boolean;
  condition?: (answers: Answers) => boolean;
}

export interface QuestionSection {
  title: string;
  titleKey?: TranslationKey;
  questions: Question[];
}

const YES_NO_OPTIONS: Option<"yes" | "no">[] = [
  { value: "yes", label: "Ja", labelKey: "questions.option.yes" },
  { value: "no", label: "Nei", labelKey: "questions.option.no" }
];

export const sections: QuestionSection[] = [
  {
    title: "Anlegg og slipp",
    titleKey: "questions.section.facilityAndRelease",
    questions: [
      {
        key: "q1FacilityType",
        label: "1. Er anlegget nytt, eksisterende eller en ombygging?",
        labelKey: "questions.q1",
        input: "select",
        options: [
          { value: "new", label: "Nytt", labelKey: "questions.option.new" },
          { value: "existing", label: "Eksisterende", labelKey: "questions.option.existing" },
          { value: "conversion", label: "Ombygging", labelKey: "questions.option.conversion" }
        ]
      },
      {
        key: "q2HighestRequiredMinFlow",
        label: "2. Hvor stor er høyeste pålagte minstevannføring?",
        labelKey: "questions.q2",
        unit: "l/s",
        unitKey: "questions.unit.lps",
        input: "number"
      },
      {
        key: "q3ReleaseRequirementVariation",
        label: "3. Hvordan varierer slippkravet over året?",
        labelKey: "questions.q3",
        input: "select",
        options: [
          { value: "fixed", label: "Fast minstevannføring", labelKey: "questions.option.fixedMinFlow" },
          { value: "seasonal", label: "Sesongkrav", labelKey: "questions.option.seasonalReq" },
          { value: "inflowControlled", label: "Tilsigsstyrt minstevannføring", labelKey: "questions.option.inflowControlled" }
        ]
      },
      {
        key: "q4ReleaseMethod",
        label: "4. Hvor og hvordan slippes minstevannføringen?",
        labelKey: "questions.q4",
        helper: "Valget avgjør hovedløsningen for slipp og måling.",
        helperKey: "questions.q4.helper",
        input: "select",
        options: [
          { value: "pipeFrostFree", label: "Gjennom rør i frostfritt rom etter varegrind", labelKey: "questions.option.pipeInFrostFreeRoom" },
          { value: "pipeNoFrostFree", label: "Gjennom rør i dam uten frostfritt rom", labelKey: "questions.option.pipeThroughDamNoFrost" },
          { value: "gateWeirOverflow", label: "Over luke, utsparing eller overløp", labelKey: "questions.option.gateWeirOverflow" },
          { value: "directRiverbed", label: "Direkte i elveleie (elvinntak)", labelKey: "questions.option.directRiverRelease" }
        ]
      }
    ]
  },
  {
    title: "Miljø og drift",
    titleKey: "questions.section.environmentAndOperation",
    questions: [
      {
        key: "q5IsSedimentClogging",
        label: "5. Er anlegget utsatt for is, drivgods, sediment eller tilstopping?",
        labelKey: "questions.q5",
        input: "yesNo",
        options: YES_NO_OPTIONS
      },
      {
        key: "q6FishPassage",
        label: "6. Har anlegget krav om fiskepassasje?",
        labelKey: "questions.q6",
        input: "yesNo",
        options: YES_NO_OPTIONS
      },
      {
        key: "q7BypassOnOutage",
        label: "7. Må tilsiget slippes forbi når kraftverket ikke er i drift?",
        labelKey: "questions.q7",
        input: "yesNo",
        options: YES_NO_OPTIONS
      }
    ]
  },
  {
    title: "Måling og kontroll",
    titleKey: "questions.section.measurementAndControl",
    questions: [
      {
        key: "q8MeasurementProfile",
        label: "8. Finnes det en egnet måleprofil nedstrøms slippstedet?",
        labelKey: "questions.q8",
        input: "select",
        options: [
          { value: "naturalStable", label: "Ja, naturlig stabil profil", labelKey: "questions.option.naturalStableProfile" },
          { value: "canBuildArtificial", label: "Nei, men kan bygges kunstig", labelKey: "questions.option.canBuildArtificial" },
          { value: "noSuitableProfile", label: "Nei, ingen egnet profil", labelKey: "questions.option.noSuitableProfile" }
        ]
      },
      {
        key: "q9PublicControl",
        label: "9. Skal allmennheten kunne kontrollere minstevannføringen på stedet?",
        labelKey: "questions.q9",
        input: "yesNo",
        options: YES_NO_OPTIONS
      }
    ]
  }
];
