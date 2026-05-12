import {
  EMPTY_ANSWERS,
  EMPTY_BACKUP_SOURCE,
  EMPTY_BATTERY,
  EMPTY_EQUIPMENT_BUDGET_SETTINGS,
  MAX_CONFIGURATION_EQUIPMENT_ROWS,
  EMPTY_MONTHLY_SOLAR_RADIATION,
  EMPTY_OTHER,
  EMPTY_RADIO_LINK_CONFIGURATION,
  EMPTY_SOLAR,
  EMPTY_SYSTEM_PARAMETERS
} from "../constants";
import {
  Answers,
  BackupSourceConfiguration,
  BatteryConfiguration,
  EquipmentBudgetSettings,
  DerivedResults,
  EditableNumber,
  EquipmentRow,
  HeightScale,
  KFactorKey,
  MonthlySolarRadiation,
  NullableBoolean,
  NvePlantDetails,
  OtherParameters,
  PlantConfiguration,
  Polarization,
  RadioLinkConfiguration,
  SolarConfiguration,
  SystemParameters
} from "../types";
import { formatLocationLabel } from "./format";
import { calculateConfigurationOutputs, calculateEquipmentBudgetRows } from "./systemResults";
import { validateConfiguration } from "./validation";

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix = "cfg"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeNumber(value: unknown): EditableNumber {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return "";
}

function normalizeBoolean(value: unknown): NullableBoolean {
  return typeof value === "boolean" ? value : null;
}

const FLOW_CLASS_MIGRATION: Record<string, Answers["q03FlowClass"]> = {
  "0_50": "0_50",
  "50_200": "50_200",
  "200_500": "200_500",
  "500_1000": "500_1000",
  "1000_2000": "1000_2000",
  over_500: "500_1000",
  over_2000: "over_2000",
  unknown: "unknown"
};

const LEGACY_RELEASE_TO_NEW: Record<string, Answers["q07ReleaseSolution"]> = {
  pipeOrChannel: "pipeIntake",
  pipeFrostFree: "pipeIntake",
  pipeNoFrostFree: "pipeThroughDam",
  royr_frostfritt: "pipeIntake",
  royr_utan_frostfritt: "pipeThroughDam",
  gateThresholdOverflow: "gate",
  gateWeirOverflow: "gate",
  luke_utsparing_overloep: "gate",
  naturalRiverbed: "noneSelected",
  directRiverbed: "noneSelected",
  direkte_elveleie: "noneSelected",
  crumpOrFlume: "noneSelected",
  vNotch: "noneSelected"
};

function migrateYesNo(value: unknown): "yes" | "no" | "" {
  if (value === "ja" || value === "yes" || value === true) return "yes";
  if (value === "nei" || value === "no" || value === false) return "no";
  return "";
}

function migrateYesNoUnknown(value: unknown): "yes" | "no" | "unknown" | "" {
  if (value === "unknown" || value === "ukjent") return "unknown";
  return migrateYesNo(value);
}

function migrateYesNoPartialUnknown(value: unknown): "yes" | "no" | "partial" | "unknown" | "" {
  if (value === "partial" || value === "delvis") return "partial";
  return migrateYesNoUnknown(value);
}

function selectString<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

function selectStringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => typeof item === "string" && (allowed as readonly string[]).includes(item))
    : [];
}

function migrateFlowClass(value: unknown): Answers["q03FlowClass"] {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 50) return "0_50";
    if (value <= 200) return "50_200";
    if (value <= 500) return "200_500";
    if (value <= 1000) return "500_1000";
    if (value <= 2000) return "1000_2000";
    return "over_2000";
  }

  return typeof value === "string" ? FLOW_CLASS_MIGRATION[value] || "" : "";
}

function migrateAnswers(value: unknown): Answers {
  const v = (value ?? {}) as Record<string, unknown>;
  const legacyLocation = (v.q4MeasurementLocation ?? v.q4ReleaseMethod ?? v.q4Slippmetode) as string | undefined;
  const legacyFishPassage = migrateYesNo(v.q1FishPassageRequired ?? v.q6FishPassage ?? v.q6Fiskepassasje);
  const legacyFishOnly = migrateYesNo(v.q2FishPassageOnly);
  const legacyCoanda = migrateYesNo(v.q3CoandaOrTyrolean);
  const oldPipeReliable = migrateYesNoUnknown(v.q7PipeMeasurementReliable);
  const oldStableProfile = migrateYesNoUnknown(v.q8StableWaterLevelProfile);

  return {
    q01ConcessionRequirement: migrateYesNoUnknown(v.q01ConcessionRequirement),
    q02ProjectType: selectString(v.q02ProjectType ?? v.q02ProjectSituation, ["new", "olderNewRequirement", "conversion", "existingOperation", "temporary", "unknown"]),
    q03FlowClass: migrateFlowClass(v.q03FlowClass ?? v.q04FlowClass ?? v.q5MinFlowBand ?? v.q2HighestRequiredMinFlow ?? v.q2HogasteMinstevassforing),
    q04RequirementPattern: selectString(v.q04RequirementPattern ?? v.q03RequirementType, ["fixed", "summerWinter", "multipleLevels", "inflowControlled", "totalFlowShare", "outageRelease", "unknown"]),
    q05PassAllInflowWhenLow: migrateYesNoUnknown(v.q05PassAllInflowWhenLow ?? v.q06PassAllInflowLowOrOutage),
    q06CanChangeRelease: migrateYesNoPartialUnknown(v.q06CanChangeRelease ?? v.q10CanChangeRelease),
    q07ReleaseSolution: selectString(v.q07ReleaseSolution ?? v.q09ReleaseSolution, ["pipeIntake", "pipeThroughDam", "gate", "damOpening", "fishPassage", "coandaSpecific", "noneSelected", "alternativeRelease", "unknown"]) || (legacyLocation ? LEGACY_RELEASE_TO_NEW[legacyLocation] || "" : ""),
    q08FishMigration: selectString(v.q08FishMigration ?? v.q07FishMigration, ["no", "upstream", "downstream", "both", "unknown"]) || (legacyFishPassage === "yes" ? "unknown" : legacyFishPassage),
    q09CoandaExists: selectString(v.q09CoandaExists, ["yes", "no", "planned", "unknown"]) || (legacyCoanda === "yes" || v.q08IntakeType === "coandaTyrolean" ? "yes" : ""),
    q10SiteChallenges: selectStringArray(v.q10SiteChallenges ?? v.q11SiteChallenges, ["flood", "debris", "sediment", "ice", "anchorIce", "freezing", "backwater", "wideShallow", "difficultAccess", "landslide", "noneKnown", "unknown"]),
    q11PowerCommunication: selectStringArray(v.q11PowerCommunication ?? v.q12PowerCommunication, ["gridPower", "solarBattery", "mobileCoverage", "satelliteRadio", "none", "unknown"]),
    q12PublicDisplay: selectStringArray(v.q12PublicDisplay ?? v.q13PublicDisplay, ["sign", "display", "staffGauge", "smsWeb", "unresolved", "no"]),
    q13AfterIntakeRack: migrateYesNoPartialUnknown(v.q13AfterIntakeRack ?? v.q14PipeAfterIntakeToProtected),
    q14DryFrostFreePlacement: selectString(v.q14DryFrostFreePlacement, ["yes", "protectedSump", "no", "unknown"]) || (migrateYesNoPartialUnknown(v.q14PipeAfterIntakeToProtected) === "yes" ? "yes" : ""),
    q15ReturnNearDam: migrateYesNoPartialUnknown(v.q15ReturnNearDam),
    q16PipeCapacityLowWater: migrateYesNoUnknown(v.q16PipeCapacityLowWater ?? v.q16PipeCapacityAtLowWater),
    q17PipeFull: migrateYesNoPartialUnknown(v.q17PipeFull ?? v.q17PipeFullAirFree) || oldPipeReliable,
    q18PipeAirFree: migrateYesNoPartialUnknown(v.q18PipeAirFree ?? v.q17PipeFullAirFree) || oldPipeReliable,
    q19StraightRunCalmFlow: migrateYesNoPartialUnknown(v.q19StraightRunCalmFlow ?? v.q18StraightRunPossible) || oldPipeReliable,
    q20ValveDownstream: migrateYesNoPartialUnknown(v.q20ValveDownstream ?? v.q19ValveDownstreamPossible),
    q21ServiceValveBefore: migrateYesNoUnknown(v.q21ServiceValveBefore),
    q22PipeGeometryType:
      selectString(v.q22PipeGeometryType, ["fullPressurePipe", "partlyFilledPipe", "openChannel", "unknown"]) ||
      (v.q22PipeGeometryType === "channel" ? "openChannel" : ""),
    q23ConductivityForMagmeter: migrateYesNoUnknown(v.q23ConductivityForMagmeter ?? v.q20ConductivityForMagmeter ?? v.q9ElectromagneticPossible),
    q24UltrasonicMountPossible: selectString(v.q24UltrasonicMountPossible ?? v.q21UltrasonicMountPossible, ["yes", "no", "notRelevant", "unknown"]) || migrateYesNoUnknown(v.q10ClampOnPossible),
    q25AdpGeometryKnown: migrateYesNoUnknown(v.q25AdpGeometryKnown ?? v.q23AdpGeometryKnown),
    q26AirEntrainedAtMeasurement: migrateYesNoPartialUnknown(v.q26AirEntrainedAtMeasurement ?? v.q24AirEntrainedAtMeasurement),
    q27RegulationFrequency: selectString(v.q27RegulationFrequency ?? v.q05RemoteControlNeed, ["no", "manualSeasonal", "motorizedSeasonal", "continuousAutomatic", "unknown"]),
    q28DownstreamPointPossible: migrateYesNoUnknown(v.q28DownstreamPointPossible ?? v.q25DownstreamStationPossible),
    q29NaturalStableProfile: migrateYesNoUnknown(v.q29NaturalStableProfile ?? v.q26NaturalProfileExists),
    q30StageDischargeUnique: migrateYesNoUnknown(v.q30StageDischargeUnique ?? v.q27StageDischargeUnique) || oldStableProfile,
    q31ProfileStable: selectString(v.q31ProfileStable ?? v.q29ProfileStable, ["yes", "partial", "no", "unknown"]),
    q32GoodWaterLevelResolution: migrateYesNoUnknown(v.q32GoodWaterLevelResolution ?? v.q28GoodWaterLevelResolution) || oldStableProfile,
    q33WideShallowRiver: migrateYesNoUnknown(v.q33WideShallowRiver),
    q34BackwaterAffects: migrateYesNoUnknown(v.q34BackwaterAffects),
    q35RepresentativeSensorPlacement: migrateYesNoUnknown(v.q35RepresentativeSensorPlacement),
    q36StationFloodRobust: migrateYesNoUnknown(v.q36StationFloodRobust ?? v.q30StationRobustPlacement),
    q37ArtificialProfilePossible: migrateYesNoUnknown(v.q37ArtificialProfilePossible ?? v.q31ArtificialProfilePossible),
    q38FallForArtificialProfile: selectString(v.q38FallForArtificialProfile ?? v.q32FallForArtificialProfile, ["yes", "no", "littleFall", "unknown"]),
    q39ArtificialProfileBlocksFish: selectString(v.q39ArtificialProfileBlocksFish ?? v.q33ArtificialProfileBlocksFish, ["yes", "no", "notRelevant", "unknown"]),
    q40ArtificialProfileFlowClass: selectString(v.q40ArtificialProfileFlowClass ?? v.q34ArtificialProfileFlowClass, ["0_50", "50_200", "200_500", "500_1000", "1000_2000", "over_2000", "unknown", "multipleLevels"]),
    q41MultipleDistinctLevels: migrateYesNoUnknown(v.q41MultipleDistinctLevels ?? v.q35TwoDistinctReleaseLevels),
    q42ArtificialProfileProtected: migrateYesNoPartialUnknown(v.q42ArtificialProfileProtected ?? v.q36ArtificialProfileProtected),
    q43LevelSensorType: selectString(v.q43LevelSensorType, ["pressureCell", "float", "bubbler", "ultrasonicLevel", "radarLevel", "unknown"]),
    q44DamPipeBelowLrv: selectString(v.q44DamPipeBelowLrv, ["yes", "no", "unknown", "notRelevant"]),
    q45DamPipeCapacityMarginNoVortex: selectString(v.q45DamPipeCapacityMarginNoVortex, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q46DamPipeSubmergedNoSediment: selectString(v.q46DamPipeSubmergedNoSediment, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q47TheoryOnlyDocumentation: migrateYesNoUnknown(v.q47TheoryOnlyDocumentation),
    q48GateLevelOpeningElectronic: selectString(v.q48GateLevelOpeningElectronic ?? v.q37GateLevelOpeningAndProfile, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q49GatePowerBackup: selectString(v.q49GatePowerBackup, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q50GateIceDebrisManageable: selectString(v.q50GateIceDebrisManageable, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q51OpeningStandardProfile: selectString(v.q51OpeningStandardProfile ?? v.q38DamOpeningProtectedStable, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q52OpeningProtected: selectString(v.q52OpeningProtected ?? v.q38DamOpeningProtectedStable, ["yes", "partial", "no", "unknown", "notRelevant"]),
    q53OpeningMeetsLowWater: selectString(v.q53OpeningMeetsLowWater, ["yes", "no", "unknown", "notRelevant"]),
    q54OpeningShape: selectString(v.q54OpeningShape, ["highNarrow", "lowWide", "other", "unknown", "notRelevant"]),
    q55FishPassageReleaseShare: selectString(v.q55FishPassageReleaseShare ?? v.q39FishPassageReleaseShare, ["whole", "partial", "no", "unknown"]) || (legacyFishOnly === "yes" ? "whole" : legacyFishOnly === "no" ? "partial" : ""),
    q56FishPassageIndependentUpstream: migrateYesNoUnknown(v.q56FishPassageIndependentUpstream),
    q57MeasurementNoFishBarrier: migrateYesNoUnknown(v.q57MeasurementNoFishBarrier),
    q58FlowSplitFishAndOther: migrateYesNoUnknown(v.q58FlowSplitFishAndOther),
    q59AttractionWaterNeed: migrateYesNoUnknown(v.q59AttractionWaterNeed),
    q60CoandaReturnPoint: selectString(v.q60CoandaReturnPoint, ["overThreshold", "rightDownstream", "severalMetersDownstream", "unknown"]),
    q61CoandaTakeoff: selectString(v.q61CoandaTakeoff ?? v.q40CoandaTakeoff, ["upstreamCoanda", "gateHouse", "regulationChamber", "intakePool", "fixedConstructionOpening", "collectionSumpUnderScreen", "unknown"]) || (legacyCoanda === "yes" ? "unknown" : ""),
    q62CoandaFlowClass: selectString(v.q62CoandaFlowClass, ["0_50", "50_200", "200_500", "over_500", "unknown"]) || (migrateFlowClass(v.q41CoandaFlowClass) === "500_1000" ? "over_500" : ""),
    q63CoandaAirEntrained: migrateYesNoPartialUnknown(v.q63CoandaAirEntrained),
    q64CoandaLittleFall: migrateYesNoUnknown(v.q64CoandaLittleFall),
    q65HourlyAutomaticLogging: migrateYesNoUnknown(v.q65HourlyAutomaticLogging ?? v.q43HourlyAutomaticLogging),
    q66AccuracyWithinFivePercent: migrateYesNoUnknown(v.q66AccuracyWithinFivePercent ?? v.q45AccuracyWithinFivePercent),
    q67CompletenessNinetySevenPercent: migrateYesNoUnknown(v.q67CompletenessNinetySevenPercent ?? v.q46CompletenessNinetySevenPercent),
    q68SecureDataStorageForNve: migrateYesNoUnknown(v.q68SecureDataStorageForNve ?? v.q44SecureDataStorageForNve),
    q69AlternativeMethod: migrateYesNo(v.q69AlternativeMethod ?? v.q42AlternativeMethodProposed),
    q70NveApprovalForAlternative: selectString(v.q70NveApprovalForAlternative, ["yes", "no", "notRelevant"])
  };
}

function normalizeSystemParameters(value: Partial<SystemParameters> | undefined): SystemParameters {
  return {
    "4gCoverage": normalizeBoolean(value?.["4gCoverage"]),
    nbIotCoverage: normalizeBoolean(value?.nbIotCoverage),
    lineOfSightUnder15km: normalizeBoolean(value?.lineOfSightUnder15km),
    inspectionsPerYear: normalizeNumber(value?.inspectionsPerYear),
    hasBackupSource: normalizeBoolean(value?.hasBackupSource),
    batteryMode: value?.batteryMode === "ah" || value?.batteryMode === "autonomyDays" ? value.batteryMode : "",
    batteryValue: normalizeNumber(value?.batteryValue)
  };
}

function normalizeSolar(value: Partial<SolarConfiguration> | undefined): SolarConfiguration {
  return {
    panelPowerWp: normalizeNumber(value?.panelPowerWp),
    panelCount: normalizeNumber(value?.panelCount),
    systemEfficiency: normalizeNumber(value?.systemEfficiency)
  };
}

function normalizeBattery(value: Partial<BatteryConfiguration> | undefined): BatteryConfiguration {
  return {
    nominalVoltage: normalizeNumber(value?.nominalVoltage),
    maxDepthOfDischarge: normalizeNumber(value?.maxDepthOfDischarge)
  };
}

function normalizeBackupSource(value: Partial<BackupSourceConfiguration> | undefined): BackupSourceConfiguration {
  return {
    purchaseCost: normalizeNumber(value?.purchaseCost),
    powerW: normalizeNumber(value?.powerW),
    fuelConsumptionPerKWh: normalizeNumber(value?.fuelConsumptionPerKWh),
    fuelPrice: normalizeNumber(value?.fuelPrice),
    lifetime: normalizeNumber(value?.lifetime),
    annualMaintenance: normalizeNumber(value?.annualMaintenance)
  };
}

function normalizeOther(value: Partial<OtherParameters> | undefined): OtherParameters {
  return {
    co2Methanol: normalizeNumber(value?.co2Methanol),
    co2Diesel: normalizeNumber(value?.co2Diesel),
    evaluationHorizonYears: normalizeNumber(value?.evaluationHorizonYears)
  };
}

function normalizeMonthlySolarRadiation(value: unknown): MonthlySolarRadiation {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    jan: normalizeNumber(v.jan),
    feb: normalizeNumber(v.feb),
    mar: normalizeNumber(v.mar),
    apr: normalizeNumber(v.apr),
    may: normalizeNumber(v.may ?? v.mai),
    jun: normalizeNumber(v.jun),
    jul: normalizeNumber(v.jul),
    aug: normalizeNumber(v.aug),
    sep: normalizeNumber(v.sep),
    oct: normalizeNumber(v.oct ?? v.okt),
    nov: normalizeNumber(v.nov),
    dec: normalizeNumber(v.dec ?? v.des)
  };
}

function normalizeEquipmentBudgetSettings(value: Partial<EquipmentBudgetSettings> | undefined): EquipmentBudgetSettings {
  return {
    displayUnit: value?.displayUnit === "ah" ? "ah" : "wh",
    useRuntimeHoursPerDay: true
  };
}

function normalizeHeightScale(value: unknown): HeightScale {
  return value === "ASL" ? "ASL" : "AGL";
}

function normalizeKFactor(value: unknown): KFactorKey {
  if (value === "1" || value === "2/3" || value === "-2/3") {
    return value;
  }

  return "4/3";
}

function normalizePolarization(value: unknown): Polarization {
  return value === "vertical" ? "vertical" : "horizontal";
}

function normalizeNumberWithDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numericDefault(value: EditableNumber, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeRadioLink(value: Partial<RadioLinkConfiguration> | undefined): RadioLinkConfiguration {
  return {
    pointA: {
      coordinate: typeof value?.pointA?.coordinate === "string" ? value.pointA.coordinate : "",
      antennaHeight: normalizeNumber(value?.pointA?.antennaHeight),
      heightScale: normalizeHeightScale(value?.pointA?.heightScale),
      antennaGainDbi:
        typeof value?.pointA?.antennaGainDbi === "number" && Number.isFinite(value.pointA.antennaGainDbi)
          ? value.pointA.antennaGainDbi
          : EMPTY_RADIO_LINK_CONFIGURATION.pointA.antennaGainDbi
    },
    pointB: {
      coordinate: typeof value?.pointB?.coordinate === "string" ? value.pointB.coordinate : "",
      antennaHeight: normalizeNumber(value?.pointB?.antennaHeight),
      heightScale: normalizeHeightScale(value?.pointB?.heightScale),
      antennaGainDbi:
        typeof value?.pointB?.antennaGainDbi === "number" && Number.isFinite(value.pointB.antennaGainDbi)
          ? value.pointB.antennaGainDbi
          : EMPTY_RADIO_LINK_CONFIGURATION.pointB.antennaGainDbi
    },
    frequencyMHz:
      typeof value?.frequencyMHz === "number" && Number.isFinite(value.frequencyMHz)
        ? value.frequencyMHz
        : EMPTY_RADIO_LINK_CONFIGURATION.frequencyMHz,
    fresnelFactor:
      typeof value?.fresnelFactor === "number" && Number.isFinite(value.fresnelFactor)
        ? value.fresnelFactor
        : EMPTY_RADIO_LINK_CONFIGURATION.fresnelFactor,
    kFactor: normalizeKFactor(value?.kFactor),
    polarization: normalizePolarization(value?.polarization),
    rainFactor:
      typeof value?.rainFactor === "number" && Number.isFinite(value.rainFactor)
        ? value.rainFactor
        : EMPTY_RADIO_LINK_CONFIGURATION.rainFactor,
    txPowerDbm: normalizeNumberWithDefault(value?.txPowerDbm, numericDefault(EMPTY_RADIO_LINK_CONFIGURATION.txPowerDbm, 27)),
    rxSensitivityDbm: normalizeNumberWithDefault(value?.rxSensitivityDbm, numericDefault(EMPTY_RADIO_LINK_CONFIGURATION.rxSensitivityDbm, -110)),
    lineLossDb: normalizeNumberWithDefault(value?.lineLossDb, numericDefault(EMPTY_RADIO_LINK_CONFIGURATION.lineLossDb, 3.5))
  };
}

function normalizeEquipmentRows(rows: unknown): EquipmentRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.slice(0, MAX_CONFIGURATION_EQUIPMENT_ROWS).map((row) => {
    const maybeRow = row as Partial<EquipmentRow>;
      return {
        id: typeof maybeRow.id === "string" && maybeRow.id.trim() ? maybeRow.id : makeId("eq"),
        active: typeof maybeRow.active === "boolean" ? maybeRow.active : true,
        name: typeof maybeRow.name === "string" ? maybeRow.name : "",
        powerW: normalizeNumber(maybeRow.powerW),
        runtimeHoursPerDay: normalizeNumber(maybeRow.runtimeHoursPerDay),
        purchaseCost: normalizeNumber(maybeRow.purchaseCost),
        lifetimeHours: normalizeNumber(maybeRow.lifetimeHours),
        annualMaintenance: normalizeNumber(maybeRow.annualMaintenance),
        supplier: typeof maybeRow.supplier === "string" ? maybeRow.supplier : "",
        comment: typeof maybeRow.comment === "string" ? maybeRow.comment : ""
      };
    });
  }

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function normalizeNvePlantDetails(value: unknown): NvePlantDetails | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const details = value as Partial<NvePlantDetails>;
  const name = normalizeString(details.name);
  if (!name) {
    return null;
  }

  return {
    name,
    stationId: normalizeString(details.stationId),
    owner: normalizeString(details.owner),
    municipality: normalizeString(details.municipality),
    county: normalizeString(details.county),
    maxOutputMW: normalizeNullableNumber(details.maxOutputMW),
    productionGWh: normalizeNullableNumber(details.productionGWh),
    grossHeadM: normalizeNullableNumber(details.grossHeadM),
    commissionedYear: normalizeString(details.commissionedYear),
    plantType: normalizeString(details.plantType),
    kdbNumber: normalizeString(details.kdbNumber ?? (details as { kdbNr?: unknown }).kdbNr),
    concessionUrl: normalizeString(details.concessionUrl),
    wikiUrl: normalizeString(details.wikiUrl),
    imageUrl: normalizeString(details.imageUrl),
    minFlowText: normalizeString(details.minFlowText),
    minFlowItems: normalizeStringArray(details.minFlowItems),
    intakeCount: normalizeNullableNumber(details.intakeCount),
    intakeItems: normalizeStringArray(details.intakeItems),
    reservoirCount: normalizeNullableNumber(details.reservoirCount),
    reservoirItems: normalizeStringArray(details.reservoirItems)
  };
}

function emptyAnnualTotals(whPerDay: number, ahPerDay: number) {
  return {
    totalWhPerDay: whPerDay, totalAhPerDay: ahPerDay,
    totalWhPerWeek: whPerDay * 7, totalAhPerWeek: ahPerDay * 7,
    annualSolarProductionKWh: 0, annualLoadDemandKWh: 0, annualEnergyBalanceKWh: 0,
    annualSecondaryRuntimeHours: 0, annualFuelConsumption: 0, annualFuelCost: 0
  };
}

function emptyReserveScenario(source: import("../types").BackupSourceName, whPerDay: number, ahPerDay: number) {
  return { source, monthlyEnergyBalance: [], annualTotals: emptyAnnualTotals(whPerDay, ahPerDay), secondarySourcePowerW: 0, costItem: null };
}

function createEmptyDerivedResults(
  configuration: Pick<PlantConfiguration, "battery" | "equipmentRows" | "equipmentBudgetSettings">
): DerivedResults {
  const equipmentBudgetRows = calculateEquipmentBudgetRows(configuration.equipmentRows, configuration.battery.nominalVoltage);
  const totalWhPerDay = equipmentBudgetRows.reduce((sum, row) => sum + row.whPerDay, 0);
  const totalAhPerDay = equipmentBudgetRows.reduce((sum, row) => sum + row.ahPerDay, 0);

  return {
    equipmentBudgetRows, totalWhPerDay, totalAhPerDay,
    totalWhPerWeek: totalWhPerDay * 7, totalAhPerWeek: totalAhPerDay * 7,
    monthlyEnergyBalance: [],
    annualTotals: emptyAnnualTotals(totalWhPerDay, totalAhPerDay),
    systemRecommendation: {
      releaseArrangement: "Ikke beregnet", primaryMeasurement: "Ikke beregnet",
      controlMeasurement: "Ikke beregnet", measurementEquipment: "Ikke beregnet",
      communication: "Ikke beregnet", loggerSetup: "Ikke beregnet",
      energyMonitoring: "Ikke beregnet", secondarySource: "NotComputed",
      secondarySourcePowerW: 0, batteryCapacityAh: 0, batteryAutonomyDays: 0,
      icingAdaptation: "Ikke beregnet", operationsRequirements: []
    },
    costComparison: { annualEnergyDeficitKWh: 0, alternatives: [] },
    reserveScenarios: {
      fuelCell: emptyReserveScenario("FuelCell", totalWhPerDay, totalAhPerDay),
      diesel: emptyReserveScenario("DieselGenerator", totalWhPerDay, totalAhPerDay)
    }
  };
}

function normalizeEngineMode(value: unknown): PlantConfiguration["engineMode"] {
  if (value === "hydroguide" || value === "combined" || value === "detailed") {
    return "hydroguide";
  }

  return "calculator";
}

function baseConfiguration(_index: number): Omit<PlantConfiguration, "lastRecommendation" | "derivedResults"> {
  const timestamp = nowIso();

  return {
    id: makeId(),
    engineMode: "calculator",
    name: "",
    location: "",
    locationPlaceId: null,
    locationLat: null,
    locationLng: null,
    nvePlantDetails: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    answers: { ...EMPTY_ANSWERS },
    systemParameters: { ...EMPTY_SYSTEM_PARAMETERS },
    solar: { ...EMPTY_SOLAR },
    battery: { ...EMPTY_BATTERY },
    fuelCell: { ...EMPTY_BACKUP_SOURCE },
    diesel: { ...EMPTY_BACKUP_SOURCE },
    other: { ...EMPTY_OTHER },
    monthlySolarRadiation: { ...EMPTY_MONTHLY_SOLAR_RADIATION },
    equipmentBudgetSettings: { ...EMPTY_EQUIPMENT_BUDGET_SETTINGS },
    equipmentRows: [],
    radioLink: {
      ...EMPTY_RADIO_LINK_CONFIGURATION,
      pointA: { ...EMPTY_RADIO_LINK_CONFIGURATION.pointA },
      pointB: { ...EMPTY_RADIO_LINK_CONFIGURATION.pointB }
    },
    cachedRadioAnalysis: null
  };
}

export function createBlankConfiguration(index: number): PlantConfiguration {
  const base = baseConfiguration(index);
  return {
    ...base,
    lastRecommendation: null,
    derivedResults: createEmptyDerivedResults(base)
  };
}

export function createResetConfiguration(config: PlantConfiguration): PlantConfiguration {
  const base = baseConfiguration(0);
  const resetBase = { ...base, id: config.id, createdAt: config.createdAt };
  return { ...resetBase, lastRecommendation: null, derivedResults: createEmptyDerivedResults(resetBase) };
}

export function cloneConfiguration(config: PlantConfiguration): PlantConfiguration {
  return JSON.parse(JSON.stringify(config)) as PlantConfiguration;
}

export function normalizeConfiguration(
  value: Partial<PlantConfiguration>,
  _index: number
): PlantConfiguration {
  const normalizedBase: PlantConfiguration = {
    id: typeof value.id === "string" && value.id.trim() ? value.id : makeId(),
    engineMode: normalizeEngineMode(value.engineMode),
    name: typeof value.name === "string" ? value.name : "",
    location: typeof value.location === "string" ? formatLocationLabel(value.location) : "",
    locationPlaceId: typeof value.locationPlaceId === "string" ? value.locationPlaceId : null,
    locationLat: typeof value.locationLat === "number" ? value.locationLat : null,
    locationLng: typeof value.locationLng === "number" ? value.locationLng : null,
    nvePlantDetails: normalizeNvePlantDetails(value.nvePlantDetails),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    answers: migrateAnswers(value.answers),
    systemParameters: normalizeSystemParameters(value.systemParameters),
    solar: normalizeSolar(value.solar),
    battery: normalizeBattery(value.battery),
    fuelCell: normalizeBackupSource(value.fuelCell),
    diesel: normalizeBackupSource(value.diesel),
    other: normalizeOther(value.other),
    monthlySolarRadiation: normalizeMonthlySolarRadiation(value.monthlySolarRadiation),
    equipmentBudgetSettings: normalizeEquipmentBudgetSettings(value.equipmentBudgetSettings),
    equipmentRows: normalizeEquipmentRows(value.equipmentRows),
    radioLink: normalizeRadioLink(value.radioLink),
    cachedRadioAnalysis: value.cachedRadioAnalysis ?? null,
    derivedResults: {} as DerivedResults,
    lastRecommendation: null
  };

  const emptyDerivedResults = createEmptyDerivedResults(normalizedBase);
  const validationErrors = validateConfiguration({
    ...normalizedBase,
    lastRecommendation: null,
    derivedResults: emptyDerivedResults
  });

  if (Object.keys(validationErrors).length > 0) {
    return {
      ...normalizedBase,
      lastRecommendation: null,
      derivedResults: emptyDerivedResults
    };
  }

  const outputs = calculateConfigurationOutputs(normalizedBase);

  return {
    ...normalizedBase,
    lastRecommendation: outputs.recommendation,
    derivedResults: outputs.derivedResults
  };
}
