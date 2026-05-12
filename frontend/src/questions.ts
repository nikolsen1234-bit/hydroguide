import type { TranslationKey } from "./i18n";
import { Answers } from "./types";

interface Option<T extends string = string> {
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
  input: "yesNo" | "select" | "number" | "multiSelect";
  options?: Option[];
  hidden?: boolean;
  required?: boolean;
  condition?: (answers: Answers) => boolean;
}

export interface QuestionSection {
  title: string;
  titleKey?: TranslationKey;
  questions: Question[];
}

const YES_NO: Option[] = [
  { value: "yes", label: "Ja" },
  { value: "no", label: "Nei" }
];

const YES_NO_UNKNOWN: Option[] = [
  { value: "yes", label: "Ja" },
  { value: "no", label: "Nei" },
  { value: "unknown", label: "Ukjent" }
];

const YES_NO_PARTIAL_UNKNOWN: Option[] = [
  { value: "yes", label: "Ja" },
  { value: "partial", label: "Delvis" },
  { value: "no", label: "Nei" },
  { value: "unknown", label: "Ukjent" }
];

const YES_NO_UNKNOWN_NOT_RELEVANT: Option[] = [
  { value: "yes", label: "Ja" },
  { value: "no", label: "Nei" },
  { value: "unknown", label: "Ukjent" },
  { value: "notRelevant", label: "Ikke relevant" }
];

const YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT: Option[] = [
  { value: "yes", label: "Ja" },
  { value: "partial", label: "Delvis" },
  { value: "no", label: "Nei" },
  { value: "unknown", label: "Ukjent" },
  { value: "notRelevant", label: "Ikke relevant" }
];

const FLOW_CLASS_OPTIONS: Option[] = [
  { value: "0_50", label: "<50 l/s" },
  { value: "50_200", label: "50-200 l/s" },
  { value: "200_500", label: "200-500 l/s" },
  { value: "500_1000", label: "0,5-1 m3/s" },
  { value: "1000_2000", label: "1-2 m3/s" },
  { value: "over_2000", label: ">2 m3/s" },
  { value: "unknown", label: "Ukjent" }
];

const COANDA_FLOW_OPTIONS: Option[] = [
  { value: "0_50", label: "0-50 l/s" },
  { value: "50_200", label: "50-200 l/s" },
  { value: "200_500", label: "200-500 l/s" },
  { value: "over_500", label: ">500 l/s" },
  { value: "unknown", label: "Ukjent" }
];

function isPipeBranch(answers: Answers): boolean {
  return (
    answers.q06CanChangeRelease === "yes" ||
    answers.q06CanChangeRelease === "partial" ||
    answers.q07ReleaseSolution === "pipeIntake" ||
    answers.q61CoandaTakeoff === "upstreamCoanda" ||
    answers.q61CoandaTakeoff === "gateHouse"
  );
}

function pipeClearlyUnsuitable(answers: Answers): boolean {
  return (
    answers.q13AfterIntakeRack === "no" ||
    answers.q16PipeCapacityLowWater === "no" ||
    answers.q17PipeFull === "no" ||
    answers.q18PipeAirFree === "no" ||
    answers.q19StraightRunCalmFlow === "no" ||
    answers.q26AirEntrainedAtMeasurement === "yes"
  );
}

function isProfileBranch(answers: Answers): boolean {
  return (
    pipeClearlyUnsuitable(answers) ||
    answers.q07ReleaseSolution === "pipeThroughDam" ||
    answers.q07ReleaseSolution === "gate" ||
    answers.q07ReleaseSolution === "damOpening" ||
    answers.q07ReleaseSolution === "fishPassage" ||
    answers.q07ReleaseSolution === "coandaSpecific" ||
    answers.q07ReleaseSolution === "alternativeRelease"
  );
}

function isDamGateOpeningBranch(answers: Answers): boolean {
  return answers.q07ReleaseSolution === "pipeThroughDam" || answers.q07ReleaseSolution === "gate" || answers.q07ReleaseSolution === "damOpening";
}

function isFishBranch(answers: Answers): boolean {
  return ["upstream", "downstream", "both"].includes(answers.q08FishMigration) || answers.q07ReleaseSolution === "fishPassage";
}

function isCoandaBranch(answers: Answers): boolean {
  return answers.q09CoandaExists === "yes" || answers.q09CoandaExists === "planned" || answers.q07ReleaseSolution === "coandaSpecific";
}

export function visibleQuestionsForAnswers(answers: Answers): Question[] {
  return sections.flatMap((section) =>
    section.questions.filter((question) => !question.hidden && (!question.condition || question.condition(answers)))
  );
}

export const sections: QuestionSection[] = [
  {
    title: "A. Grunnlag",
    questions: [
      { key: "q01ConcessionRequirement", label: "Q1. Gjelder dette et konsesjonskrav/pålegg om minstevannføring?", input: "select", options: YES_NO_UNKNOWN, hidden: true, required: false },
      {
        key: "q02ProjectType",
        label: "Q2. Prosjekttype?",
        input: "select",
        hidden: true,
        required: false,
        options: [
          { value: "new", label: "Nytt anlegg" },
          { value: "conversion", label: "Ombygging" },
          { value: "existingOperation", label: "Eksisterende anlegg" },
          { value: "olderNewRequirement", label: "Eldre anlegg med nytt krav" },
          { value: "temporary", label: "Midlertidig løsning" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      { key: "q03FlowClass", label: "Q3. Hva er minstevannføringskravet?", input: "select", options: FLOW_CLASS_OPTIONS },
      {
        key: "q04RequirementPattern",
        label: "Q4. Hvilket kravmønster gjelder?",
        input: "select",
        hidden: true,
        required: false,
        options: [
          { value: "fixed", label: "Én fast verdi" },
          { value: "summerWinter", label: "Sommer-vinter" },
          { value: "multipleLevels", label: "Flere perioder" },
          { value: "inflowControlled", label: "Tilsigsstyrt" },
          { value: "totalFlowShare", label: "Andel av total vannføring" },
          { value: "outageRelease", label: "Slipp ved driftsstans" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      { key: "q05PassAllInflowWhenLow", label: "Q5. Skal hele tilsiget slippes dersom tilsiget er lavere enn kravet?", input: "select", options: YES_NO_UNKNOWN, hidden: true, required: false },
      { key: "q06CanChangeRelease", label: "Q6. Kan slippløsningen endres før prosjektering/godkjenning?", input: "select", options: YES_NO_PARTIAL_UNKNOWN },
      {
        key: "q07ReleaseSolution",
        label: "Q7. Hva er dagens eller planlagt inntak/slippløsning?",
        input: "select",
        options: [
          { value: "pipeIntake", label: "Rør via inntak" },
          { value: "pipeThroughDam", label: "Rør gjennom dam" },
          { value: "gate", label: "Tappeluke" },
          { value: "damOpening", label: "Utsparing i dam" },
          { value: "fishPassage", label: "Fiskepassasje" },
          { value: "coandaSpecific", label: "Coanda-/tyrolerrist" },
          { value: "noneSelected", label: "Ingen valgt" },
          { value: "alternativeRelease", label: "Alternativ slippform" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      {
        key: "q08FishMigration",
        label: "Q8. Er det krav eller sterke hensyn til fiskevandring?",
        input: "select",
        options: [
          { value: "no", label: "Nei" },
          { value: "upstream", label: "Oppvandring" },
          { value: "downstream", label: "Nedvandring" },
          { value: "both", label: "Begge" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      {
        key: "q09CoandaExists",
        label: "Q9. Finnes coanda-/tyrolerrist?",
        input: "select",
        options: [
          { value: "yes", label: "Ja" },
          { value: "no", label: "Nei" },
          { value: "planned", label: "Planlagt" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      {
        key: "q10SiteChallenges",
        label: "Q10. Hvilke driftsutfordringer finnes?",
        input: "multiSelect",
        options: [
          { value: "flood", label: "Flom" },
          { value: "debris", label: "Drivgods" },
          { value: "sediment", label: "Sediment" },
          { value: "ice", label: "Is" },
          { value: "anchorIce", label: "Sarr/bunnis" },
          { value: "freezing", label: "Tilfrysing" },
          { value: "backwater", label: "Oppstuving nedstrøms" },
          { value: "wideShallow", label: "Bred/grunn elv" },
          { value: "difficultAccess", label: "Vanskelig adkomst" },
          { value: "landslide", label: "Skredfare" },
          { value: "noneKnown", label: "Ingen kjent" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      {
        key: "q11PowerCommunication",
        label: "Q11. Er det strøm og kommunikasjon ved målestedet?",
        input: "multiSelect",
        options: [
          { value: "gridPower", label: "Nettstrøm" },
          { value: "solarBattery", label: "Solcelle/batteri mulig" },
          { value: "mobileCoverage", label: "Mobildekning" },
          { value: "satelliteRadio", label: "Radio/satellitt mulig" },
          { value: "none", label: "Nei" },
          { value: "unknown", label: "Ukjent" }
        ]
      },
      {
        key: "q12PublicDisplay",
        label: "Q12. Skal allmennheten kunne kontrollere slippet på stedet?",
        input: "multiSelect",
        hidden: true,
        required: false,
        options: [
          { value: "sign", label: "Skilt" },
          { value: "display", label: "Display" },
          { value: "staffGauge", label: "Målestav" },
          { value: "smsWeb", label: "SMS/nett" },
          { value: "unresolved", label: "Ikke avklart" },
          { value: "no", label: "Nei" }
        ]
      }
    ]
  },
  {
    title: "B. Rør via inntak eller rørflowmåler",
    questions: [
      { key: "q13AfterIntakeRack", label: "Q13. Kan vannet tas ut etter inntaksrist/varegrind?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isPipeBranch },
      {
        key: "q14DryFrostFreePlacement",
        label: "Q14. Kan måler og elektronikk stå tørt og frostfritt, eventuelt i beskyttet kum?",
        input: "select",
        options: [
          { value: "yes", label: "Ja" },
          { value: "protectedSump", label: "Beskyttet kum" },
          { value: "no", label: "Nei" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isPipeBranch
      },
      { key: "q15ReturnNearDam", label: "Q15. Kan rørutløpet føres tilbake i elva nær dam/terskel?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, hidden: true, required: false, condition: isPipeBranch },
      { key: "q16PipeCapacityLowWater", label: "Q16. Har røret kapasitet ved laveste driftsvannstand/LRV?", input: "select", options: YES_NO_UNKNOWN, condition: isPipeBranch },
      { key: "q17PipeFull", label: "Q17. Kan målerstrekningen holdes vannfylt?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isPipeBranch },
      { key: "q18PipeAirFree", label: "Q18. Er vannet ved målerstrekningen luftfritt eller nesten luftfritt?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isPipeBranch },
      { key: "q19StraightRunCalmFlow", label: "Q19. Kan krav til rettstrekk, leverandørkrav og rolig/laminær strømning oppfylles?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isPipeBranch },
      { key: "q20ValveDownstream", label: "Q20. Kan reguleringsventil plasseres nedstrøms måleren?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, hidden: true, required: false, condition: isPipeBranch },
      { key: "q21ServiceValveBefore", label: "Q21. Kan revisjons-/serviceventil etableres foran måleutstyret?", input: "select", options: YES_NO_UNKNOWN, hidden: true, required: false, condition: isPipeBranch },
      {
        key: "q22PipeGeometryType",
        label: "Q22. Hva slags rør-/kanaltilstand har målepunktet?",
        input: "select",
        options: [
          { value: "fullPressurePipe", label: "Fullt trykkrør" },
          { value: "partlyFilledPipe", label: "Delvis fylt rør" },
          { value: "openChannel", label: "Åpen kanal" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isPipeBranch
      },
      { key: "q23ConductivityForMagmeter", label: "Q23. Har vannet nok ledningsevne for elektromagnetisk måler?", input: "select", options: YES_NO_UNKNOWN, condition: isPipeBranch },
      {
        key: "q24UltrasonicMountPossible",
        label: "Q24. Kan ultralydsensor monteres i tråd med leverandørkrav, uten tap av akustisk kontakt?",
        input: "select",
        options: [...YES_NO_UNKNOWN, { value: "notRelevant", label: "Ikke relevant" }],
        condition: isPipeBranch
      },
      { key: "q25AdpGeometryKnown", label: "Q25. Er rør/kanal stor nok, og er geometrien kjent nok for ADP?", input: "select", options: YES_NO_UNKNOWN, condition: isPipeBranch },
      { key: "q26AirEntrainedAtMeasurement", label: "Q26. Er vannet luftinnblandet, for eksempel fra samlekum under coandarist?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isPipeBranch },
      {
        key: "q27RegulationFrequency",
        label: "Q27. Må slippet reguleres ofte?",
        input: "select",
        hidden: true,
        required: false,
        options: [
          { value: "no", label: "Nei" },
          { value: "manualSeasonal", label: "Sesongvis manuelt" },
          { value: "motorizedSeasonal", label: "Sesongvis motorisert" },
          { value: "continuousAutomatic", label: "Kontinuerlig automatisk" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isPipeBranch
      }
    ]
  },
  {
    title: "C. Nedstrøms måleprofil / vannstandsstasjon",
    questions: [
      { key: "q28DownstreamPointPossible", label: "Q28. Kan det etableres målepunkt nedstrøms slippstedet uten vesentlige uregistrerte tilsig mellom slipp og målepunkt?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q29NaturalStableProfile", label: "Q29. Finnes et naturlig stabilt bestemmende profil, for eksempel fjellterskel/kulp?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q30StageDischargeUnique", label: "Q30. Er forholdet mellom vannstand og vannføring entydig på målestedet?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q31ProfileStable", label: "Q31. Er profilet stabilt mot flom, isgang, sediment og inngrep?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isProfileBranch },
      { key: "q32GoodWaterLevelResolution", label: "Q32. Er vannstandsoppløsningen god rundt minstevannføringen?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q33WideShallowRiver", label: "Q33. Er elva bred og grunn ved kravsatt slipp?", input: "select", options: YES_NO_UNKNOWN, hidden: true, required: false, condition: isProfileBranch },
      { key: "q34BackwaterAffects", label: "Q34. Kan nedstrøms vannstand/oppstuving påvirke målingen?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q35RepresentativeSensorPlacement", label: "Q35. Kan vannstandssensor plasseres i rolig og representativt vann?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q36StationFloodRobust", label: "Q36. Kan målestasjon, sensor, fastmerke og målestav plasseres flomrobust?", input: "select", options: YES_NO_UNKNOWN, condition: isProfileBranch },
      { key: "q37ArtificialProfilePossible", label: "Q37. Kan kunstig måleprofil bygges dersom naturlig profil ikke er egnet?", input: "select", options: YES_NO_UNKNOWN, condition: (answers) => isProfileBranch(answers) && answers.q29NaturalStableProfile !== "yes" },
      {
        key: "q38FallForArtificialProfile",
        label: "Q38. Er det nok høydeforskjell/fall for V-profil eller rektangulært profil?",
        input: "select",
        options: [
          { value: "yes", label: "Ja" },
          { value: "littleFall", label: "Lite fall" },
          { value: "no", label: "Nei" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: (answers) => answers.q37ArtificialProfilePossible === "yes"
      },
      { key: "q39ArtificialProfileBlocksFish", label: "Q39. Vil kunstig profil kunne bli vandringshinder for fisk?", input: "select", options: [...YES_NO_UNKNOWN, { value: "notRelevant", label: "Ikke relevant" }], condition: (answers) => answers.q37ArtificialProfilePossible === "yes" },
      { key: "q40ArtificialProfileFlowClass", label: "Q40. Hvilken vannføringsklasse skal profilet dekke?", input: "select", options: [...FLOW_CLASS_OPTIONS, { value: "multipleLevels", label: "Flere nivåer" }], condition: (answers) => answers.q37ArtificialProfilePossible === "yes" },
      { key: "q41MultipleDistinctLevels", label: "Q41. Må samme profil håndtere to eller flere svært ulike krav?", input: "select", options: YES_NO_UNKNOWN, condition: (answers) => answers.q37ArtificialProfilePossible === "yes" },
      { key: "q42ArtificialProfileProtected", label: "Q42. Kan kunstig profil beskyttes mot is, sediment og drivgods?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: (answers) => answers.q37ArtificialProfilePossible === "yes" },
      {
        key: "q43LevelSensorType",
        label: "Q43. Hvilken vannstandssensor er praktisk mulig?",
        input: "select",
        hidden: true,
        required: false,
        options: [
          { value: "pressureCell", label: "Trykkcelle" },
          { value: "float", label: "Flottør" },
          { value: "bubbler", label: "Boblerør" },
          { value: "ultrasonicLevel", label: "Ultralydnivå" },
          { value: "radarLevel", label: "Radarnivå" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isProfileBranch
      }
    ]
  },
  {
    title: "D. Rør gjennom dam, tappeluke og utsparing",
    questions: [
      { key: "q44DamPipeBelowLrv", label: "Q44. For rør gjennom dam: ligger røret under LRV/laveste driftsvannstand?", input: "select", options: YES_NO_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "pipeThroughDam" },
      { key: "q45DamPipeCapacityMarginNoVortex", label: "Q45. For rør gjennom dam: er røret dimensjonert med margin og uten stor risiko for virvler/luftinnsug?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "pipeThroughDam" },
      { key: "q46DamPipeSubmergedNoSediment", label: "Q46. For rør gjennom dam: er røret tilstrekkelig dykket og ikke kombinert med bunnløp der sediment kan blokkere?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "pipeThroughDam" },
      { key: "q47TheoryOnlyDocumentation", label: "Q47. Er dokumentasjonen basert på teoretisk rør-/luke-/utsparingskapasitet alene?", input: "select", options: YES_NO_UNKNOWN, condition: isDamGateOpeningBranch },
      { key: "q48GateLevelOpeningElectronic", label: "Q48. For tappeluke: kan både vannstand og lukeåpning registreres elektronisk?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "gate" },
      { key: "q49GatePowerBackup", label: "Q49. For tappeluke: finnes reguleringsmulighet og strøm/backup ved automatisk drift?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, hidden: true, required: false, condition: (answers) => answers.q07ReleaseSolution === "gate" },
      { key: "q50GateIceDebrisManageable", label: "Q50. For tappeluke: er is, drivgods og tilstopping håndterbart?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, hidden: true, required: false, condition: (answers) => answers.q07ReleaseSolution === "gate" },
      { key: "q51OpeningStandardProfile", label: "Q51. For utsparing: kan utsparingen utformes som standard profil med dokumenterbar kapasitet?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "damOpening" },
      { key: "q52OpeningProtected", label: "Q52. For utsparing: er profilet sikret mot tilstopping og ising?", input: "select", options: YES_NO_PARTIAL_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "damOpening" },
      { key: "q53OpeningMeetsLowWater", label: "Q53. For utsparing: kan kravet oppfylles ved laveste driftsvannstand?", input: "select", options: YES_NO_UNKNOWN_NOT_RELEVANT, condition: (answers) => answers.q07ReleaseSolution === "damOpening" },
      {
        key: "q54OpeningShape",
        label: "Q54. For utsparing: er utsparingen høy/smal heller enn lav/bred?",
        input: "select",
        options: [
          { value: "highNarrow", label: "Høy/smal" },
          { value: "lowWide", label: "Lav/bred" },
          { value: "other", label: "Annen standardform" },
          { value: "unknown", label: "Ukjent" },
          { value: "notRelevant", label: "Ikke relevant" }
        ],
        condition: (answers) => answers.q07ReleaseSolution === "damOpening"
      }
    ]
  },
  {
    title: "E. Fiskepassasje",
    questions: [
      { key: "q55FishPassageReleaseShare", label: "Q55. Skal minstevannføringen slippes i fiskepassasjen?", input: "select", options: [{ value: "whole", label: "Hele" }, { value: "partial", label: "Deler" }, { value: "no", label: "Nei" }, { value: "unknown", label: "Ukjent" }], condition: isFishBranch },
      { key: "q56FishPassageIndependentUpstream", label: "Q56. Fungerer fiskepassasjen uavhengig av vannstanden oppstrøms dammen?", input: "select", options: YES_NO_UNKNOWN, condition: isFishBranch },
      { key: "q57MeasurementNoFishBarrier", label: "Q57. Kan målearrangementet etableres uten å bli vandringshinder eller forsinke fisk?", input: "select", options: YES_NO_UNKNOWN, condition: isFishBranch },
      { key: "q58FlowSplitFishAndOther", label: "Q58. Splittes minstevannføringen mellom fiskepassasje og annet slipp?", input: "select", options: YES_NO_UNKNOWN, condition: isFishBranch },
      { key: "q59AttractionWaterNeed", label: "Q59. Finnes behov for lokkevann eller separat vandringsvann?", input: "select", options: YES_NO_UNKNOWN, hidden: true, required: false, condition: isFishBranch }
    ]
  },
  {
    title: "F. Coanda-/tyrolerrist",
    questions: [
      {
        key: "q60CoandaReturnPoint",
        label: "Q60. Hvor slippes vannet tilbake?",
        input: "select",
        options: [
          { value: "overThreshold", label: "Over coandaterskel" },
          { value: "rightDownstream", label: "Rett nedstrøms terskel" },
          { value: "severalMetersDownstream", label: "Flere meter nedstrøms" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isCoandaBranch
      },
      {
        key: "q61CoandaTakeoff",
        label: "Q61. Hvor tas vannet ut?",
        input: "select",
        options: [
          { value: "upstreamCoanda", label: "Oppstrøms coandainntak" },
          { value: "gateHouse", label: "Lukehus" },
          { value: "regulationChamber", label: "Reguleringskammer" },
          { value: "intakePool", label: "Inntaksbasseng" },
          { value: "fixedConstructionOpening", label: "Fast konstruksjon/utsparing" },
          { value: "collectionSumpUnderScreen", label: "Samlekum under rist" },
          { value: "unknown", label: "Ukjent" }
        ],
        condition: isCoandaBranch
      },
      { key: "q62CoandaFlowClass", label: "Q62. Coanda-slippklasse?", input: "select", options: COANDA_FLOW_OPTIONS, condition: isCoandaBranch },
      { key: "q63CoandaAirEntrained", label: "Q63. Er vannet ved målepunktet luftinnblandet?", input: "select", options: YES_NO_PARTIAL_UNKNOWN, condition: isCoandaBranch },
      { key: "q64CoandaLittleFall", label: "Q64. Er fallhøyden liten mellom inntaksbasseng/kanal og elv nedstrøms?", input: "select", options: YES_NO_UNKNOWN, condition: isCoandaBranch }
    ]
  },
  {
    title: "G. Sluttkrav for NVE-klar anbefaling",
    questions: [
      { key: "q65HourlyAutomaticLogging", label: "Q65. Kan løsningen logge automatisk minst én gang per time?", input: "select", options: YES_NO_UNKNOWN },
      { key: "q66AccuracyWithinFivePercent", label: "Q66. Kan løsningen prosjekteres til +/-5 prosent nøyaktighet ved kravsatt slipp?", input: "select", options: YES_NO_UNKNOWN },
      { key: "q67CompletenessNinetySevenPercent", label: "Q67. Kan løsningen oppnå minst 97 prosent komplette/korrekte registreringer i kravperioden?", input: "select", options: YES_NO_UNKNOWN },
      { key: "q68SecureDataStorageForNve", label: "Q68. Kan data lagres sikkert og framlegges for NVE gjennom konsesjonsperioden?", input: "select", options: YES_NO_UNKNOWN },
      { key: "q69AlternativeMethod", label: "Q69. Er metoden en alternativ metode som indeks, radarbasert vannføringsberegning eller modell alene?", input: "yesNo", options: YES_NO },
      { key: "q70NveApprovalForAlternative", label: "Q70. Dersom Q69 = Ja: er NVE-samråd/godkjenning avklart?", input: "select", options: [{ value: "yes", label: "Ja" }, { value: "no", label: "Nei" }, { value: "notRelevant", label: "Ikke relevant" }], condition: (answers) => answers.q69AlternativeMethod === "yes" }
    ]
  }
];
