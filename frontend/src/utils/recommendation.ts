import {
  Answers,
  ConfidenceStatus,
  DecisionStatus,
  MeasurementMethodCode,
  MethodSummary,
  Recommendation,
  ReleaseSolutionCode
} from "../types";
import { dedupe } from "./format";

interface Candidate extends MethodSummary {
  releaseSolutionCode?: ReleaseSolutionCode;
  releaseSolutionName?: string;
  measurementMethodCode: MeasurementMethodCode;
  measurementMethodName: string;
  principle: string;
  reasons: string[];
  requirements: string[];
  score: number;
}

const RELEASE_NAMES: Record<ReleaseSolutionCode, string> = {
  S1: "Rør via inntak/varegrind til frostfritt rom eller beskyttet kum",
  S2: "Rør direkte gjennom dam/terskel",
  S3: "Tappeluke",
  S4: "Utsparing i dam/overløpsterskel",
  S5: "Fiskepassasje",
  S6: "Coanda-/tyrolerrist-løsning",
  S7: "Annen/alternativ slippform"
};

const METHOD_NAMES: Record<MeasurementMethodCode, string> = {
  M1: "Direkte flowmåler i rør",
  M1a: "Elektromagnetisk rørmåler",
  M1b: "Ultralydmåler i/på rør",
  M1c: "Måleblende/måledyse",
  M1d: "ADP i rør/kanal",
  M2: "Vannstand + vannføringskurve i naturlig elveprofil",
  M3: "Vannstand + kunstig V-profil",
  M4: "Vannstand + rektangulært eller sammensatt profil",
  M5: "Vannstand + Crump-overløp",
  M6: "Vannstand i fiskepassasje med hydraulisk dokumentasjon",
  M7: "Coanda-spesifikk kombinasjon",
  M8: "Alternativ metode",
  X1: "Teoretisk beregning alene",
  X2: "Kamera/manuell observasjon alene",
  NONE: "Ingen dokumenterbar målemetode identifisert"
};

const DOCUMENTATION_REQUIREMENTS = [
  "Automatisk registrering minst én gang per time.",
  "Målenøyaktighet innenfor +/-5 prosent ved kravsatt slipp.",
  "Minst 97 prosent komplette/korrekte registreringer.",
  "Data må lagres sikkert og kunne framlegges for NVE."
];

const SILENT_NVE_REQUIREMENTS = [
  "Eventuelle krav til kontrollmåling og periodisk kontroll håndteres i prosjektering/drift, ikke i spørreflyten.",
  "Ved vannstandsstasjon må vannføringskurve, fastmerke, sensorplassering og flomrobusthet dokumenteres etter gjeldende NVE-krav.",
  "Ved alternativ metode må opplegg avklares med NVE før løsningen kan brukes som endelig anbefaling."
];

function candidate(input: {
  releaseSolutionCode?: ReleaseSolutionCode;
  measurementMethodCode: MeasurementMethodCode;
  rank: number;
  score?: number;
  nveAnchors: string[];
  reasons: string[];
  requirements?: string[];
  principle?: string;
}): Candidate {
  const releaseSolutionName = input.releaseSolutionCode ? RELEASE_NAMES[input.releaseSolutionCode] : undefined;
  const measurementMethodName = METHOD_NAMES[input.measurementMethodCode];
  const methodCode = input.releaseSolutionCode
    ? `${input.releaseSolutionCode}+${input.measurementMethodCode}`
    : input.measurementMethodCode;
  const methodName = input.releaseSolutionCode
    ? `${releaseSolutionName} med ${measurementMethodName}`
    : measurementMethodName;

  return {
    releaseSolutionCode: input.releaseSolutionCode,
    releaseSolutionName,
    measurementMethodCode: input.measurementMethodCode,
    measurementMethodName,
    methodCode,
    methodName,
    solutionName: methodName,
    rank: input.rank,
    nveAnchors: input.nveAnchors,
    reason: input.reasons[0],
    reasons: dedupe(input.reasons).filter(Boolean),
    requirements: dedupe(input.requirements ?? []).filter(Boolean),
    principle: input.principle ?? measurementMethodName,
    score: input.score ?? 0
  };
}

function yes(value: unknown): boolean {
  return value === "yes";
}

function yesOrPartial(value: unknown): boolean {
  return value === "yes" || value === "partial";
}

function unknownOrEmpty(value: unknown): boolean {
  return value === "" || value === "unknown" || value === undefined || value === null;
}

function flowRank(value: Answers["q03FlowClass"] | Answers["q40ArtificialProfileFlowClass"] | Answers["q62CoandaFlowClass"]): number {
  if (value === "0_50") return 1;
  if (value === "50_200") return 2;
  if (value === "200_500") return 3;
  if (value === "500_1000") return 4;
  if (value === "1000_2000") return 5;
  if (value === "over_2000" || value === "over_500") return 6;
  if (value === "multipleLevels") return 7;
  return 0;
}

function flowLabel(value: Answers["q03FlowClass"] | Answers["q40ArtificialProfileFlowClass"] | Answers["q62CoandaFlowClass"]): string {
  if (value === "0_50") return "0-50 l/s";
  if (value === "50_200") return "50-200 l/s";
  if (value === "200_500") return "200-500 l/s";
  if (value === "500_1000") return "0,5-1 m3/s";
  if (value === "1000_2000") return "1-2 m3/s";
  if (value === "over_2000") return "over 2 m3/s";
  if (value === "over_500") return "over 500 l/s";
  if (value === "multipleLevels") return "flere nivåer";
  return "ukjent";
}

function isCoandaActive(answers: Answers): boolean {
  return answers.q09CoandaExists === "yes" || answers.q09CoandaExists === "planned" || answers.q07ReleaseSolution === "coandaSpecific";
}

function isFishActive(answers: Answers): boolean {
  return ["upstream", "downstream", "both"].includes(answers.q08FishMigration) || answers.q07ReleaseSolution === "fishPassage";
}

function canEvaluatePipe(answers: Answers): boolean {
  return (
    yesOrPartial(answers.q06CanChangeRelease) ||
    answers.q07ReleaseSolution === "pipeIntake" ||
    answers.q61CoandaTakeoff === "upstreamCoanda" ||
    answers.q61CoandaTakeoff === "gateHouse"
  );
}

function pipeReady(answers: Answers): boolean {
  return (
    canEvaluatePipe(answers) &&
    yes(answers.q13AfterIntakeRack) &&
    (answers.q14DryFrostFreePlacement === "yes" || answers.q14DryFrostFreePlacement === "protectedSump") &&
    yes(answers.q16PipeCapacityLowWater) &&
    yes(answers.q17PipeFull) &&
    yesOrPartial(answers.q18PipeAirFree) &&
    yesOrPartial(answers.q19StraightRunCalmFlow) &&
    answers.q26AirEntrainedAtMeasurement !== "yes"
  );
}

function pipeCandidates(answers: Answers): Candidate[] {
  if (!pipeReady(answers)) return [];

  const reasons = [
    "Vannet kan tas ut etter inntaksrist/varegrind.",
    "Måler og elektronikk kan stå tørt/frostfritt eller i beskyttet kum.",
    "Røret kan holdes vannfylt og uten uakseptabel luftinnblanding.",
    "Rettstrekk, rolig strømning og leverandørkrav kan oppfylles."
  ];
  const requirements = [
    "Reguleringsventil bør plasseres nedstrøms måleren.",
    "Rettstrekk, lufting, svanehals og drenering må prosjekteres etter leverandørkrav.",
    "Rørutløpet må føres tilbake til elva slik at kravsatt strekning får vann."
  ];
  const baseScore = 100 - Math.max(0, flowRank(answers.q03FlowClass) - 4) * 8;
  const out: Candidate[] = [];

  if (answers.q22PipeGeometryType === "fullPressurePipe" && yes(answers.q17PipeFull) && yes(answers.q18PipeAirFree)) {
    if (yes(answers.q23ConductivityForMagmeter)) {
      out.push(candidate({
        releaseSolutionCode: "S1",
        measurementMethodCode: "M1a",
        rank: 1,
        score: baseScore + 8,
        nveAnchors: ["K1", "K2", "K3", "K4", "K5"],
        reasons: [...reasons, "Vannet har nok ledningsevne for elektromagnetisk måler."],
        requirements,
        principle: "Direkte registrering av vannføring i fullt rør"
      }));
    }

    if (yes(answers.q24UltrasonicMountPossible)) {
      out.push(candidate({
        releaseSolutionCode: "S1",
        measurementMethodCode: "M1b",
        rank: 1,
        score: baseScore + 4,
        nveAnchors: ["K1", "K2", "K3", "K4", "K5"],
        reasons: [...reasons, "Ultralydsensor kan monteres i tråd med leverandørkrav."],
        requirements,
        principle: "Direkte registrering med ultralydmåler i fullt rør"
      }));
    }

    if (answers.q14DryFrostFreePlacement === "yes" || answers.q14DryFrostFreePlacement === "protectedSump") {
      out.push(candidate({
        releaseSolutionCode: "S1",
        measurementMethodCode: "M1c",
        rank: 1,
        score: baseScore - 2,
        nveAnchors: ["K1", "K2", "K3", "K4", "K5"],
        reasons: [...reasons, "Trykkdifferanse kan måles frostfritt dersom arrangementet prosjekteres for dette."],
        requirements: [...requirements, "Trykkuttak og differansetrykkmåling må være frostfri og kalibrerbar."],
        principle: "Direkte/indirekte registrering i rør via differansetrykk"
      }));
    }
  }

  if ((answers.q22PipeGeometryType === "partlyFilledPipe" || answers.q22PipeGeometryType === "openChannel") && yes(answers.q25AdpGeometryKnown)) {
    out.push(candidate({
      releaseSolutionCode: "S1",
      measurementMethodCode: "M1d",
      rank: 1,
      score: baseScore,
      nveAnchors: ["K1", "K2", "K3", "K4", "K5"],
      reasons: [...reasons, "Rør/kanal kan være delvis fylt, men geometri og dimensjon er kjent nok for ADP."],
      requirements: [...requirements, "ADP-sensor må sikres mot sediment, skade og feil geometri."],
      principle: "ADP-måling i rør eller kanal med kjent geometri"
    }));
  }

  if (out.length === 0) {
    out.push(candidate({
      releaseSolutionCode: "S1",
      measurementMethodCode: "M1",
      rank: 1,
      score: baseScore - 10,
      nveAnchors: ["K1", "K2", "K3", "K5"],
      reasons,
      requirements,
      principle: "Direkte registrering av vannføring i rør"
    }));
  }

  return out;
}

function naturalProfileReady(answers: Answers): boolean {
  return (
    yes(answers.q28DownstreamPointPossible) &&
    yes(answers.q29NaturalStableProfile) &&
    yes(answers.q30StageDischargeUnique) &&
    yesOrPartial(answers.q31ProfileStable) &&
    yes(answers.q32GoodWaterLevelResolution) &&
    answers.q34BackwaterAffects !== "yes" &&
    yes(answers.q35RepresentativeSensorPlacement) &&
    (answers.q36StationFloodRobust === "yes" || answers.q36StationFloodRobust === "unknown")
  );
}

function naturalProfileCandidate(answers: Answers, release: ReleaseSolutionCode | undefined): Candidate | null {
  if (!naturalProfileReady(answers)) return null;

  return candidate({
    releaseSolutionCode: release,
    measurementMethodCode: "M2",
    rank: 2,
    score: 80 + (flowRank(answers.q03FlowClass) >= 5 ? 12 : 0),
    nveAnchors: ["K1", "K2", "K8", "K10", "K15", "K16"],
    reasons: [
      "Det finnes et naturlig stabilt bestemmende profil nedstrøms slippstedet.",
      "Vannstand-vannføring-sammenhengen er entydig, og vannstandsoppløsningen er god.",
      flowRank(answers.q03FlowClass) >= 5 ? "Stor vannføring gjør naturlig profil særlig aktuelt." : ""
    ],
    requirements: [
      "Vannføringskurve må etableres og dokumenteres.",
      "Sensor, fastmerke, målestav og logger må plasseres flomrobust.",
      "Vinter-, is- og flomforhold må vurderes ved befaring."
    ],
    principle: "Vannstand med vannføringskurve i naturlig profil"
  });
}

function artificialProfileCandidate(answers: Answers, release: ReleaseSolutionCode | undefined): Candidate | null {
  if (!yes(answers.q37ArtificialProfilePossible) || answers.q39ArtificialProfileBlocksFish === "yes") return null;
  if (answers.q42ArtificialProfileProtected === "no" && answers.q10SiteChallenges.some((v) => ["ice", "sediment", "debris"].includes(v))) return null;
  if (answers.q38FallForArtificialProfile === "no") return null;

  const reasons = [
    "Naturlig profil er ikke valgt som egnet, og kunstig måleprofil kan bygges.",
    "Profilet er ikke oppgitt som vandringshinder for fisk."
  ];
  const requirements = [
    "Kunstig profil må bygges nøyaktig etter standard og med kjent geometri.",
    "Vannstandssensor må plasseres i representativt vann.",
    "Profil må beskyttes mot is, sediment og drivgods."
  ];

  if (answers.q38FallForArtificialProfile === "littleFall") {
    return candidate({
      releaseSolutionCode: release,
      measurementMethodCode: "M5",
      rank: 3,
      score: 72,
      nveAnchors: ["K1", "K2", "K9", "K10", "K15", "K16"],
      reasons: [...reasons, "Lite fall peker mot Crump-overløp."],
      requirements,
      principle: "Vannstand med standardisert Crump-overløp"
    });
  }

  if (yes(answers.q41MultipleDistinctLevels) || answers.q40ArtificialProfileFlowClass === "multipleLevels" || flowRank(answers.q40ArtificialProfileFlowClass) >= 4) {
    return candidate({
      releaseSolutionCode: release,
      measurementMethodCode: "M4",
      rank: 3,
      score: 70 + (flowRank(answers.q03FlowClass) >= 5 ? 8 : 0),
      nveAnchors: ["K1", "K2", "K9", "K10", "K15", "K16"],
      reasons: [...reasons, "Større slipp eller flere nivåer peker mot rektangulært/sammensatt profil."],
      requirements,
      principle: "Vannstand med rektangulært eller sammensatt kunstig profil"
    });
  }

  if (["0_50", "50_200", "200_500"].includes(String(answers.q40ArtificialProfileFlowClass)) && answers.q38FallForArtificialProfile === "yes") {
    return candidate({
      releaseSolutionCode: release,
      measurementMethodCode: "M3",
      rank: 3,
      score: 74,
      nveAnchors: ["K1", "K2", "K9", "K10", "K15", "K16"],
      reasons: [...reasons, "Lite til middels slipp og nok fall peker mot V-profil."],
      requirements,
      principle: "Vannstand med kunstig V-profil"
    });
  }

  return null;
}

function profileCandidate(answers: Answers, release: ReleaseSolutionCode | undefined): Candidate | null {
  return naturalProfileCandidate(answers, release) ?? artificialProfileCandidate(answers, release);
}

function damGateOpeningCandidates(answers: Answers): Candidate[] {
  const out: Candidate[] = [];

  if (answers.q07ReleaseSolution === "pipeThroughDam") {
    const prof = profileCandidate(answers, "S2");
    if (prof) {
      out.push({
        ...prof,
        rank: Math.max(prof.rank, 3),
        score: prof.score - 5,
        reasons: ["Rør gjennom dam brukes som slipp, men dokumentasjonen skjer med nedstrøms måleprofil.", ...prof.reasons],
        requirements: [
          "Teoretisk rørkapasitet alene er ikke tilstrekkelig dokumentasjon.",
          "Rør må ligge under LRV/laveste driftsvannstand og sikres mot virvler, luftinnsug, is og sediment.",
          ...prof.requirements
        ]
      });
    }
  }

  if (answers.q07ReleaseSolution === "gate" || flowRank(answers.q03FlowClass) >= 5) {
    const prof = profileCandidate(answers, "S3");
    if (prof && yesOrPartial(answers.q48GateLevelOpeningElectronic)) {
      out.push({
        ...prof,
        rank: 4,
        score: prof.score + (flowRank(answers.q03FlowClass) >= 5 ? 10 : 0) - 8,
        reasons: ["Tappeluke er aktuell for større slipp eller eksisterende luke, og målingen dokumenteres nedstrøms.", ...prof.reasons],
        requirements: [
          "Vannstand og lukeåpning skal registreres elektronisk.",
          "Lukekurve/teoretisk kapasitet alene er ikke nok.",
          ...prof.requirements
        ]
      });
    }
  }

  if (answers.q07ReleaseSolution === "damOpening") {
    const prof = profileCandidate(answers, "S4");
    if (prof && yesOrPartial(answers.q51OpeningStandardProfile) && yesOrPartial(answers.q52OpeningProtected) && yes(answers.q53OpeningMeetsLowWater)) {
      out.push({
        ...prof,
        rank: 5,
        score: prof.score + (flowRank(answers.q03FlowClass) >= 5 ? 8 : 0) + (answers.q54OpeningShape === "highNarrow" ? 5 : 0) - (answers.q54OpeningShape === "lowWide" ? 12 : 0),
        reasons: ["Utsparing i dam er valgt, og standard/profilert dokumentasjon kan etableres.", ...prof.reasons],
        requirements: [
          "Utsparing må sikres mot tilstopping og ising.",
          "Kravet må kunne oppfylles ved laveste driftsvannstand.",
          ...prof.requirements
        ]
      });
    }
  }

  return out;
}

function fishCandidate(answers: Answers): Candidate | null {
  if (!isFishActive(answers)) return null;
  if (answers.q57MeasurementNoFishBarrier === "no") return null;
  if ((answers.q55FishPassageReleaseShare === "whole" || answers.q55FishPassageReleaseShare === "partial") && yes(answers.q56FishPassageIndependentUpstream) && yes(answers.q57MeasurementNoFishBarrier)) {
    return candidate({
      releaseSolutionCode: "S5",
      measurementMethodCode: "M6",
      rank: 6,
      score: 68,
      nveAnchors: ["K1", "K2", "K12", "K16"],
      reasons: [
        "Hele eller deler av minstevannføringen skal slippes i fiskepassasje.",
        "Fiskepassasjen fungerer uavhengig av vannstanden oppstrøms.",
        "Målearrangementet kan etableres uten vandringshinder eller forsinkelse."
      ],
      requirements: [
        "Vannstand/vannføringskurve eller teknisk hydraulisk sammenheng i passasjen må dokumentere slippet.",
        answers.q58FlowSplitFishAndOther === "yes"
          ? "Når vannet splittes, må totalen måles nedstrøms eller hver relevant komponent måles slik at samlet minstevannføring dokumenteres."
          : "",
        "Løsningen må ikke forsinke, skade eller hindre fisk."
      ],
      principle: "Vannstand i fiskepassasje med hydraulisk dokumentasjon"
    });
  }

  return null;
}

function coandaCandidates(answers: Answers): Candidate[] {
  if (!isCoandaActive(answers)) return [];

  const commonRequirements = [
    "Coanda-løsning må vurderes prosjektspesifikt.",
    "Slippet må prosjekteres over eller rett nedstrøms coandaterskelen slik at elva ikke tørrlegges rett nedenfor inntaket.",
    "Luftinnblandet vann fra samlekum skal ikke måles med elektromagnetisk/ultralyd flowmåler uten luftfri rørstrekning."
  ];
  const reasons = [
    "Coanda-/tyrolerrist er valgt eller planlagt.",
    `Oppgitt coanda-slippklasse er ${flowLabel(answers.q62CoandaFlowClass)}.`
  ];

  if (answers.q61CoandaTakeoff === "regulationChamber" && ["0_50", "50_200", "200_500"].includes(answers.q62CoandaFlowClass)) {
    return [candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 64, nveAnchors: ["K1", "K2", "K13", "K14", "K16"], reasons: [...reasons, "Reguleringskammer passer NVEs coanda-gruppe 0-500 l/s."], requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" })];
  }

  if (answers.q61CoandaTakeoff === "intakePool" && ["200_500", "over_500"].includes(answers.q62CoandaFlowClass)) {
    return [candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 64, nveAnchors: ["K1", "K2", "K13", "K14", "K16"], reasons: [...reasons, "Inntaksbasseng passer NVEs coanda-gruppe over 200 l/s."], requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" })];
  }

  if (answers.q61CoandaTakeoff === "fixedConstructionOpening" && answers.q62CoandaFlowClass === "0_50") {
    return [candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 62, nveAnchors: ["K1", "K2", "K13", "K14", "K16"], reasons: [...reasons, "Fast konstruksjon/utsparing passer NVEs coanda-gruppe 0-50 l/s."], requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" })];
  }

  if (answers.q61CoandaTakeoff === "collectionSumpUnderScreen" || answers.q63CoandaAirEntrained === "yes" || answers.q63CoandaAirEntrained === "partial") {
    return [candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 58, nveAnchors: ["K1", "K2", "K13", "K14", "K16"], reasons: [...reasons, "Samlekum/luftinnblanding gjør vanlig rørflowmåling usikker uten luftfri strekning."], requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" })];
  }

  if (answers.q64CoandaLittleFall === "yes") {
    const crump = candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 60, nveAnchors: ["K1", "K2", "K9", "K13", "K14", "K16"], reasons: [...reasons, "Lite fall gjør Crump eller annen prosjektspesifikk løsning mer aktuell enn tradisjonelt profil."], requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" });
    return [crump];
  }

  return [candidate({ releaseSolutionCode: "S6", measurementMethodCode: "M7", rank: 7, score: 54, nveAnchors: ["K1", "K2", "K13", "K14", "K16"], reasons, requirements: commonRequirements, principle: "Prosjektspesifikk coanda-kombinasjon" })];
}

function alternativeCandidate(answers: Answers): Candidate | null {
  if (answers.q69AlternativeMethod !== "yes") return null;
  return candidate({
    releaseSolutionCode: answers.q07ReleaseSolution === "alternativeRelease" ? "S7" : undefined,
    measurementMethodCode: "M8",
    rank: 8,
    score: 30,
    nveAnchors: ["K11"],
    reasons: ["Det er valgt eller foreslått alternativ metode som indeks, radarbasert vannføringsberegning eller modell."],
    requirements: ["Metoden kan ikke gis som endelig anbefaling uten NVE-samråd/godkjenning."],
    principle: "Alternativ metode som krever NVE-samråd"
  });
}

function standaloneProfileCandidate(answers: Answers): Candidate | null {
  if (answers.q07ReleaseSolution !== "" && answers.q07ReleaseSolution !== "unknown" && answers.q07ReleaseSolution !== "noneSelected") {
    return null;
  }

  if (answers.q28DownstreamPointPossible !== "yes") return null;
  return profileCandidate(answers, undefined);
}

function collectCandidates(answers: Answers): Candidate[] {
  const candidates = [
    ...pipeCandidates(answers),
    ...damGateOpeningCandidates(answers),
    fishCandidate(answers),
    ...coandaCandidates(answers),
    alternativeCandidate(answers),
    standaloneProfileCandidate(answers)
  ].filter((item): item is Candidate => Boolean(item));

  return candidates
    .filter((candidate, index, arr) => arr.findIndex((other) => other.methodCode === candidate.methodCode) === index)
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.methodCode.localeCompare(b.methodCode));
}

function collectDiscouraged(answers: Answers): Array<{ methodCode: string; methodName?: string; reason: string }> {
  const discouraged: Array<{ methodCode: string; methodName?: string; reason: string }> = [
    { methodCode: "X1", methodName: METHOD_NAMES.X1, reason: "Teoretisk beregning alene skal ikke brukes som eneste dokumentasjon av minstevannføring." },
    { methodCode: "X2", methodName: METHOD_NAMES.X2, reason: "Kamera eller manuell observasjon alene er bare supplement, ikke hoveddokumentasjon." }
  ];

  if (answers.q47TheoryOnlyDocumentation === "yes" && ["pipeThroughDam", "gate", "damOpening"].includes(answers.q07ReleaseSolution)) {
    discouraged.push({ methodCode: "X1", methodName: METHOD_NAMES.X1, reason: "For rør gjennom dam, luker og utsparing er teoretisk kapasitet alene ikke tilstrekkelig dokumentasjon." });
  }
  if (answers.q17PipeFull === "no" || answers.q18PipeAirFree === "no" || answers.q26AirEntrainedAtMeasurement === "yes" || answers.q63CoandaAirEntrained === "yes") {
    discouraged.push({ methodCode: "M1a/M1b", reason: "Elektromagnetisk og ultralyd flowmåler frarådes til full og luftfri målerstrekning kan etableres." });
  }
  if (answers.q19StraightRunCalmFlow === "no") {
    discouraged.push({ methodCode: "M1a/M1b/M1c", reason: "Rørflowmåling frarådes når rettstrekk og leverandørkrav til strømning ikke kan oppfylles." });
  }
  if (answers.q28DownstreamPointPossible === "no" && ["pipeThroughDam", "gate", "damOpening"].includes(answers.q07ReleaseSolution)) {
    discouraged.push({ methodCode: "M2/M3/M4/M5", reason: "Nedstrøms måleprofil er ikke dokumenterbar når egnet målested mangler." });
  }
  if (answers.q39ArtificialProfileBlocksFish === "yes") {
    discouraged.push({ methodCode: "M3/M4/M5", reason: "Kunstig profil frarådes når profilet kan bli vandringshinder for fisk." });
  }
  if (answers.q52OpeningProtected === "no") {
    discouraged.push({ methodCode: "S4", reason: "Utsparing i dam frarådes når tilstopping og ising ikke er håndtert." });
  }
  if (isCoandaActive(answers) && answers.q60CoandaReturnPoint === "severalMetersDownstream") {
    discouraged.push({ methodCode: "S6", reason: "Coanda-slipp flere meter nedstrøms kan tørrlegge strekningen rett nedenfor inntaket." });
  }

  return dedupe(discouraged.map((item) => `${item.methodCode}|${item.methodName ?? ""}|${item.reason}`)).map((raw) => {
    const [methodCode, methodName, reason] = raw.split("|");
    return { methodCode, methodName: methodName || undefined, reason };
  });
}

function collectMissing(answers: Answers, candidates: Candidate[]): string[] {
  const missing: string[] = [];

  if (unknownOrEmpty(answers.q03FlowClass)) missing.push("Kravsatt minstevannføring og periode/størrelsesklasse mangler.");
  if (unknownOrEmpty(answers.q07ReleaseSolution)) missing.push("Slippløsning er ikke valgt.");
  if (answers.q11PowerCommunication.length === 0 || answers.q11PowerCommunication.includes("unknown")) missing.push("Strøm og kommunikasjon ved målestedet er ikke avklart.");

  if (canEvaluatePipe(answers)) {
    if (unknownOrEmpty(answers.q13AfterIntakeRack)) missing.push("Det er ikke avklart om vannet kan tas ut etter inntaksrist/varegrind.");
    if (unknownOrEmpty(answers.q14DryFrostFreePlacement)) missing.push("Det er ikke avklart om måler/elektronikk kan stå tørt og frostfritt eller i beskyttet kum.");
    if (unknownOrEmpty(answers.q16PipeCapacityLowWater)) missing.push("Rørkapasitet ved laveste driftsvannstand/LRV er ikke avklart.");
    if (unknownOrEmpty(answers.q17PipeFull)) missing.push("Det er ikke avklart om målerstrekningen kan holdes vannfylt.");
    if (unknownOrEmpty(answers.q18PipeAirFree)) missing.push("Det er ikke avklart om målerstrekningen er luftfri.");
    if (unknownOrEmpty(answers.q19StraightRunCalmFlow)) missing.push("Rettstrekk, leverandørkrav og rolig strømning er ikke avklart.");
    if (candidates.some((item) => item.measurementMethodCode === "M1a") && unknownOrEmpty(answers.q23ConductivityForMagmeter)) missing.push("Vannets ledningsevne for elektromagnetisk måler er ukjent.");
  }

  if (["pipeThroughDam", "gate", "damOpening"].includes(answers.q07ReleaseSolution)) {
    if (unknownOrEmpty(answers.q28DownstreamPointPossible)) missing.push("Nedstrøms målepunkt er ikke avklart.");
    if (answers.q07ReleaseSolution === "pipeThroughDam" && answers.q44DamPipeBelowLrv !== "yes") missing.push("For rør gjennom dam må det avklares at røret ligger under LRV/laveste driftsvannstand.");
    if (answers.q07ReleaseSolution === "pipeThroughDam" && !yes(answers.q45DamPipeCapacityMarginNoVortex)) missing.push("For rør gjennom dam må kapasitet med margin og lav risiko for virvler/luftinnsug avklares.");
    if (answers.q07ReleaseSolution === "pipeThroughDam" && !yes(answers.q46DamPipeSubmergedNoSediment)) missing.push("For rør gjennom dam må sikring mot is, tilstopping og sedimentblokkering avklares.");
  }

  if (isFishActive(answers)) {
    if (unknownOrEmpty(answers.q55FishPassageReleaseShare)) missing.push("Det er ikke avklart om minstevannføringen skal slippes helt eller delvis i fiskepassasjen.");
    if (unknownOrEmpty(answers.q57MeasurementNoFishBarrier)) missing.push("Det er ikke avklart om målearrangementet kan etableres uten vandringshinder.");
  }

  if (isCoandaActive(answers)) {
    if (unknownOrEmpty(answers.q60CoandaReturnPoint)) missing.push("For coanda er det ikke avklart hvor vannet slippes tilbake.");
    if (unknownOrEmpty(answers.q61CoandaTakeoff)) missing.push("For coanda er uttakspunkt ikke avklart.");
    if (answers.q60CoandaReturnPoint !== "" && !["overThreshold", "rightDownstream"].includes(answers.q60CoandaReturnPoint)) {
      missing.push("Coanda-slipp må prosjekteres over eller rett nedstrøms coandaterskelen.");
    }
  }

  if (answers.q65HourlyAutomaticLogging === "unknown") missing.push("Automatisk logging minst én gang per time er ikke avklart.");
  if (answers.q66AccuracyWithinFivePercent === "unknown") missing.push("Nøyaktighet innenfor +/-5 prosent er ikke avklart.");
  if (answers.q67CompletenessNinetySevenPercent === "unknown") missing.push("97 prosent komplette/korrekte registreringer er ikke avklart.");
  if (answers.q68SecureDataStorageForNve === "unknown") missing.push("Sikker datalagring og fremlegging for NVE er ikke avklart.");

  return dedupe(missing);
}

function deriveDecisionStatus(answers: Answers, primary: Candidate, candidates: Candidate[], missing: string[]): DecisionStatus {
  if (answers.q69AlternativeMethod === "yes" && answers.q70NveApprovalForAlternative !== "yes") return "KREVER_NVE_SAMRAAD";
  if (
    answers.q65HourlyAutomaticLogging === "no" ||
    answers.q66AccuracyWithinFivePercent === "no" ||
    answers.q67CompletenessNinetySevenPercent === "no" ||
    answers.q68SecureDataStorageForNve === "no" ||
    (isCoandaActive(answers) && answers.q60CoandaReturnPoint === "severalMetersDownstream") ||
    (["pipeThroughDam", "gate", "damOpening"].includes(answers.q07ReleaseSolution) && answers.q28DownstreamPointPossible === "no") ||
    (answers.q07ReleaseSolution === "gate" && answers.q48GateLevelOpeningElectronic === "no") ||
    (answers.q07ReleaseSolution === "damOpening" && (answers.q52OpeningProtected === "no" || answers.q53OpeningMeetsLowWater === "no"))
  ) {
    return "IKKE_NVE_KLAR";
  }
  if (primary.measurementMethodCode === "X1" || primary.measurementMethodCode === "X2") return "FRARADET";
  if (candidates.length === 0 || missing.length > 0) return "FORELOPIG_MANGLER_DATA";
  return "ANBEFALT";
}

function confidenceFromDecision(status: DecisionStatus): ConfidenceStatus {
  if (status === "ANBEFALT") return "Recommended";
  if (status === "IKKE_NVE_KLAR" || status === "FRARADET") return "NeedsReview";
  return "NeedsClarification";
}

function fallbackCandidate(answers: Answers): Candidate {
  if (answers.q69AlternativeMethod === "yes") {
    return candidate({
      releaseSolutionCode: answers.q07ReleaseSolution === "alternativeRelease" ? "S7" : undefined,
      measurementMethodCode: "M8",
      rank: 8,
      score: 10,
      nveAnchors: ["K11"],
      reasons: ["Alternativ metode er valgt, men NVE-samråd/godkjenning er ikke avklart."],
      requirements: ["Avklar metoden med NVE før den brukes som endelig anbefaling."],
      principle: "Alternativ metode som krever NVE-samråd"
    });
  }

  return candidate({
    measurementMethodCode: "NONE",
    rank: 99,
    score: 0,
    nveAnchors: ["K1", "K2"],
    reasons: [
      "Svarene er ikke tilstrekkelige til å velge dokumenterbar løsning.",
      `Oppgitt slippstørrelse: ${flowLabel(answers.q03FlowClass)}.`
    ],
    requirements: DOCUMENTATION_REQUIREMENTS,
    principle: "Måleprinsipp må fastsettes fra valgt slippløsning og målested"
  });
}

export function calculateRecommendation(answers: Answers): Recommendation {
  const candidates = collectCandidates(answers);
  const primary = candidates[0] ?? fallbackCandidate(answers);
  const missingForFinalChoice = collectMissing(answers, candidates);
  const decisionStatus = deriveDecisionStatus(answers, primary, candidates, missingForFinalChoice);
  const discouragedMethods = collectDiscouraged(answers);
  const alternatives = candidates
    .filter((item) => item.methodCode !== primary.methodCode)
    .map(({ releaseSolutionCode, measurementMethodCode, methodCode, methodName, solutionName, rank, nveAnchors, reason }) => ({
      releaseSolutionCode,
      measurementMethodCode,
      methodCode,
      methodName,
      solutionName,
      rank,
      nveAnchors,
      reason
    }));

  const fishRequirement = isFishActive(answers)
    ? "Fiskekrav er aktivt: målearrangementet må ikke bli vandringshinder eller forsinke fisk."
    : "";
  const coandaRequirement = isCoandaActive(answers)
    ? "Coanda-løsning må vurderes prosjektspesifikt, og slippet må føres over eller rett nedstrøms terskelen."
    : "";
  const notReady =
    decisionStatus === "IKKE_NVE_KLAR"
      ? "Metoden kan være hydraulisk riktig, men sluttkrav eller nødvendig dokumentasjon er ikke oppfylt."
      : "";

  const justification = dedupe([
    ...primary.reasons,
    `Anbefalingen er ${primary.releaseSolutionCode ? `${primary.releaseSolutionCode} + ` : ""}${primary.measurementMethodCode}, forankret i ${primary.nveAnchors.join(", ")}.`,
    `Oppgitt vannføringsklasse er ${flowLabel(answers.q03FlowClass)}.`,
    fishRequirement,
    coandaRequirement,
    notReady
  ].filter(Boolean)).slice(0, 9);

  const additionalRequirements = dedupe([
    ...primary.requirements,
    ...DOCUMENTATION_REQUIREMENTS,
    ...missingForFinalChoice.map((item) => `Mangler for endelig valg: ${item}`),
    ...discouragedMethods.map((item) => `Frarådet ${item.methodCode}: ${item.reason}`)
  ]);

  return {
    mainSolution: primary.methodCode === "NONE" ? primary.methodName : `${primary.methodCode} - ${primary.methodName}`,
    controlMeasurementMethod: primary.principle,
    justification,
    additionalRequirements,
    status: confidenceFromDecision(decisionStatus),
    decisionStatus,
    releaseSolutionCode: primary.releaseSolutionCode,
    releaseSolutionName: primary.releaseSolutionName,
    measurementMethodCode: primary.measurementMethodCode,
    measurementMethodName: primary.measurementMethodName,
    methodCode: primary.methodCode,
    methodName: primary.methodName,
    rank: primary.rank,
    nveAnchors: primary.nveAnchors,
    alternatives,
    discouragedMethods,
    missingForFinalChoice,
    documentationRequirements: DOCUMENTATION_REQUIREMENTS,
    silentNveRequirements: SILENT_NVE_REQUIREMENTS
  };
}
