export type YesNo = "yes" | "no";
export type YesNoUnknown = YesNo | "unknown";
export type YesNoPartialUnknown = YesNoUnknown | "partial";
export type EditableNumber = number | "";
export type NullableBoolean = boolean | null;

export type FlowClass = "0_50" | "50_200" | "200_500" | "500_1000" | "1000_2000" | "over_2000" | "unknown";
export type ProjectSituation = "new" | "olderNewRequirement" | "conversion" | "existingOperation" | "temporary" | "unknown";
export type RequirementType = "fixed" | "summerWinter" | "multipleLevels" | "inflowControlled" | "totalFlowShare" | "outageRelease" | "unknown";
export type ReleaseControlNeed = "no" | "manualSeasonal" | "motorizedSeasonal" | "continuousAutomatic" | "unknown";
export type FishMigrationNeed = "no" | "upstream" | "downstream" | "both" | "unknown";
export type ReleaseSolution =
  | "pipeIntake"
  | "pipeThroughDam"
  | "gate"
  | "damOpening"
  | "fishPassage"
  | "coandaSpecific"
  | "noneSelected"
  | "alternativeRelease"
  | "unknown";
export type SiteChallenge =
  | "flood"
  | "debris"
  | "sediment"
  | "ice"
  | "anchorIce"
  | "freezing"
  | "backwater"
  | "wideShallow"
  | "difficultAccess"
  | "landslide"
  | "noneKnown"
  | "unknown";
export type PowerCommunicationOption = "gridPower" | "solarBattery" | "mobileCoverage" | "satelliteRadio" | "none" | "unknown";
export type PublicDisplayOption = "sign" | "display" | "staffGauge" | "smsWeb" | "unresolved" | "no";
export type PipeGeometryType = "fullPressurePipe" | "partlyFilledPipe" | "openChannel" | "unknown";
export type ProfileStability = "yes" | "partial" | "no" | "unknown";
export type ArtificialFall = "yes" | "no" | "littleFall" | "unknown";
export type DryFrostFreePlacement = "yes" | "protectedSump" | "no" | "unknown";
export type CoandaExists = "yes" | "no" | "planned" | "unknown";
export type FishPassageShare = "whole" | "partial" | "no" | "unknown";
export type LevelSensorType = "pressureCell" | "float" | "bubbler" | "ultrasonicLevel" | "radarLevel" | "unknown";
export type OpeningShape = "highNarrow" | "lowWide" | "other" | "unknown" | "notRelevant";
export type CoandaReturnPoint = "overThreshold" | "rightDownstream" | "severalMetersDownstream" | "unknown";
export type CoandaTakeoff =
  | "upstreamCoanda"
  | "gateHouse"
  | "regulationChamber"
  | "intakePool"
  | "fixedConstructionOpening"
  | "collectionSumpUnderScreen"
  | "unknown";
export type CoandaFlowClass = "0_50" | "50_200" | "200_500" | "over_500" | "unknown";
export type DecisionStatus = "ANBEFALT" | "FORELOPIG_MANGLER_DATA" | "IKKE_NVE_KLAR" | "KREVER_NVE_SAMRAAD" | "FRARADET";
export type ReleaseSolutionCode = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
export type MeasurementMethodCode = "M1" | "M1a" | "M1b" | "M1c" | "M1d" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "X1" | "X2" | "NONE";
export type BatteryMode = "ah" | "autonomyDays";
export type MonthKey = "jan" | "feb" | "mar" | "apr" | "may" | "jun" | "jul" | "aug" | "sep" | "oct" | "nov" | "dec";
export type BudgetDisplayUnit = "wh" | "ah";
export type HeightScale = "AGL" | "ASL";
export type Polarization = "horizontal" | "vertical";
export type KFactorKey = "4/3" | "1" | "2/3" | "-2/3";
export type BackupSourceName = "FuelCell" | "DieselGenerator";

export type EngineMode = "calculator" | "hydroguide";

export type ConfidenceStatus = "Recommended" | "NeedsReview" | "NeedsClarification";

export interface Answers {
  q01ConcessionRequirement: YesNoUnknown | "";
  q02ProjectType: ProjectSituation | "";
  q03FlowClass: FlowClass | "";
  q04RequirementPattern: RequirementType | "";
  q05PassAllInflowWhenLow: YesNoUnknown | "";
  q06CanChangeRelease: YesNoPartialUnknown | "";
  q07ReleaseSolution: ReleaseSolution | "";
  q08FishMigration: FishMigrationNeed | "";
  q09CoandaExists: CoandaExists | "";
  q10SiteChallenges: SiteChallenge[];
  q11PowerCommunication: PowerCommunicationOption[];
  q12PublicDisplay: PublicDisplayOption[];
  q13AfterIntakeRack: YesNoPartialUnknown | "";
  q14DryFrostFreePlacement: DryFrostFreePlacement | "";
  q15ReturnNearDam: YesNoPartialUnknown | "";
  q16PipeCapacityLowWater: YesNoUnknown | "";
  q17PipeFull: YesNoPartialUnknown | "";
  q18PipeAirFree: YesNoPartialUnknown | "";
  q19StraightRunCalmFlow: YesNoPartialUnknown | "";
  q20ValveDownstream: YesNoPartialUnknown | "";
  q21ServiceValveBefore: YesNoUnknown | "";
  q22PipeGeometryType: PipeGeometryType | "";
  q23ConductivityForMagmeter: YesNoUnknown | "";
  q24UltrasonicMountPossible: YesNoUnknown | "notRelevant" | "";
  q25AdpGeometryKnown: YesNoUnknown | "";
  q26AirEntrainedAtMeasurement: YesNoPartialUnknown | "";
  q27RegulationFrequency: ReleaseControlNeed | "";
  q28DownstreamPointPossible: YesNoUnknown | "";
  q29NaturalStableProfile: YesNoUnknown | "";
  q30StageDischargeUnique: YesNoUnknown | "";
  q31ProfileStable: ProfileStability | "";
  q32GoodWaterLevelResolution: YesNoUnknown | "";
  q33WideShallowRiver: YesNoUnknown | "";
  q34BackwaterAffects: YesNoUnknown | "";
  q35RepresentativeSensorPlacement: YesNoUnknown | "";
  q36StationFloodRobust: YesNoUnknown | "";
  q37ArtificialProfilePossible: YesNoUnknown | "";
  q38FallForArtificialProfile: ArtificialFall | "";
  q39ArtificialProfileBlocksFish: YesNoUnknown | "notRelevant" | "";
  q40ArtificialProfileFlowClass: FlowClass | "multipleLevels" | "";
  q41MultipleDistinctLevels: YesNoUnknown | "";
  q42ArtificialProfileProtected: YesNoPartialUnknown | "";
  q43LevelSensorType: LevelSensorType | "";
  q44DamPipeBelowLrv: YesNoUnknown | "notRelevant" | "";
  q45DamPipeCapacityMarginNoVortex: YesNoPartialUnknown | "notRelevant" | "";
  q46DamPipeSubmergedNoSediment: YesNoPartialUnknown | "notRelevant" | "";
  q47TheoryOnlyDocumentation: YesNoUnknown | "";
  q48GateLevelOpeningElectronic: YesNoPartialUnknown | "notRelevant" | "";
  q49GatePowerBackup: YesNoPartialUnknown | "notRelevant" | "";
  q50GateIceDebrisManageable: YesNoPartialUnknown | "notRelevant" | "";
  q51OpeningStandardProfile: YesNoPartialUnknown | "notRelevant" | "";
  q52OpeningProtected: YesNoPartialUnknown | "notRelevant" | "";
  q53OpeningMeetsLowWater: YesNoUnknown | "notRelevant" | "";
  q54OpeningShape: OpeningShape | "";
  q55FishPassageReleaseShare: FishPassageShare | "";
  q56FishPassageIndependentUpstream: YesNoUnknown | "";
  q57MeasurementNoFishBarrier: YesNoUnknown | "";
  q58FlowSplitFishAndOther: YesNoUnknown | "";
  q59AttractionWaterNeed: YesNoUnknown | "";
  q60CoandaReturnPoint: CoandaReturnPoint | "";
  q61CoandaTakeoff: CoandaTakeoff | "";
  q62CoandaFlowClass: CoandaFlowClass | "";
  q63CoandaAirEntrained: YesNoPartialUnknown | "";
  q64CoandaLittleFall: YesNoUnknown | "";
  q65HourlyAutomaticLogging: YesNoUnknown | "";
  q66AccuracyWithinFivePercent: YesNoUnknown | "";
  q67CompletenessNinetySevenPercent: YesNoUnknown | "";
  q68SecureDataStorageForNve: YesNoUnknown | "";
  q69AlternativeMethod: YesNo | "";
  q70NveApprovalForAlternative: YesNo | "notRelevant" | "";
}

export interface MethodSummary {
  releaseSolutionCode?: ReleaseSolutionCode;
  measurementMethodCode: MeasurementMethodCode;
  methodCode: string;
  methodName: string;
  solutionName?: string;
  rank: number;
  nveAnchors: string[];
  reason?: string;
}

export interface Recommendation {
  mainSolution: string;
  controlMeasurementMethod: string;
  justification: string[];
  additionalRequirements: string[];
  status: ConfidenceStatus;
  decisionStatus?: DecisionStatus;
  releaseSolutionCode?: ReleaseSolutionCode;
  releaseSolutionName?: string;
  measurementMethodCode?: MeasurementMethodCode;
  measurementMethodName?: string;
  methodCode?: string;
  methodName?: string;
  rank?: number;
  nveAnchors?: string[];
  alternatives?: MethodSummary[];
  discouragedMethods?: Array<{ methodCode: string; methodName?: string; reason: string }>;
  missingForFinalChoice?: string[];
  documentationRequirements?: string[];
  silentNveRequirements?: string[];
}

export interface SystemParameters {
  "4gCoverage": NullableBoolean;
  nbIotCoverage: NullableBoolean;
  lineOfSightUnder15km: NullableBoolean;
  inspectionsPerYear: EditableNumber;
  hasBackupSource: NullableBoolean;
  batteryMode: BatteryMode | "";
  batteryValue: EditableNumber;
}

export interface SolarConfiguration {
  panelPowerWp: EditableNumber;
  panelCount: EditableNumber;
  systemEfficiency: EditableNumber;
}

export interface BatteryConfiguration {
  nominalVoltage: EditableNumber;
  maxDepthOfDischarge: EditableNumber;
}

export interface BackupSourceConfiguration {
  purchaseCost: EditableNumber;
  powerW: EditableNumber;
  fuelConsumptionPerKWh: EditableNumber;
  fuelPrice: EditableNumber;
  lifetime: EditableNumber;
  annualMaintenance: EditableNumber;
}

export interface OtherParameters {
  co2Methanol: EditableNumber;
  co2Diesel: EditableNumber;
  evaluationHorizonYears: EditableNumber;
}

export interface MonthlySolarRadiation {
  jan: EditableNumber;
  feb: EditableNumber;
  mar: EditableNumber;
  apr: EditableNumber;
  may: EditableNumber;
  jun: EditableNumber;
  jul: EditableNumber;
  aug: EditableNumber;
  sep: EditableNumber;
  oct: EditableNumber;
  nov: EditableNumber;
  dec: EditableNumber;
}

export interface EquipmentBudgetSettings {
  displayUnit: BudgetDisplayUnit;
  useRuntimeHoursPerDay: boolean;
}

export interface RadioLinkEndpointConfiguration {
  coordinate: string;
  antennaHeight: EditableNumber;
  heightScale: HeightScale;
  antennaGainDbi: EditableNumber;
}

export interface RadioLinkConfiguration {
  pointA: RadioLinkEndpointConfiguration;
  pointB: RadioLinkEndpointConfiguration;
  frequencyMHz: number;
  fresnelFactor: number;
  kFactor: KFactorKey;
  polarization: Polarization;
  rainFactor: number;
  txPowerDbm: EditableNumber;
  rxSensitivityDbm: EditableNumber;
  lineLossDb: EditableNumber;
}

export interface EquipmentRow {
  id: string;
  active: boolean;
  name: string;
  powerW: EditableNumber;
  runtimeHoursPerDay: EditableNumber;
  purchaseCost: EditableNumber;
  lifetimeHours: EditableNumber;
  annualMaintenance: EditableNumber;
  supplier: string;
  comment: string;
}

export interface EquipmentBudgetRow {
  id: string;
  active: boolean;
  name: string;
  powerW: number;
  currentA: number;
  runtimeHoursPerDay: number;
  whPerDay: number;
  ahPerDay: number;
  whPerMonth: number;
  ahPerMonth: number;
  whPerWeek: number;
  ahPerWeek: number;
}

export interface MonthlyEnergyBalanceRow {
  month: MonthKey;
  label: string;
  daysInMonth: number;
  solarProductionKWh: number;
  loadDemandKWh: number;
  energyBalanceKWh: number;
  secondaryRuntimeHours: number;
  fuelLiters: number;
  fuelCost: number;
}

export interface AnnualTotals {
  totalWhPerDay: number;
  totalAhPerDay: number;
  totalWhPerWeek: number;
  totalAhPerWeek: number;
  annualSolarProductionKWh: number;
  annualLoadDemandKWh: number;
  annualEnergyBalanceKWh: number;
  annualSecondaryRuntimeHours: number;
  annualFuelConsumption: number;
  annualFuelCost: number;
}

export interface SystemRecommendationResult {
  releaseArrangement: string;
  primaryMeasurement: string;
  controlMeasurement: string;
  measurementEquipment: string;
  communication: string;
  loggerSetup: string;
  energyMonitoring: string;
  secondarySource: BackupSourceName | "NotComputed";
  secondarySourcePowerW: number;
  batteryCapacityAh: number;
  batteryAutonomyDays: number;
  icingAdaptation: string;
  operationsRequirements: string[];
}

export interface CostComparisonItem {
  source: BackupSourceName;
  purchaseCost: number;
  operatingCostPerYear: number;
  annualMaintenance: number;
  evaluationHorizonYears: number;
  technicalLifetimeHours: number;
  totalRuntimeHours: number;
  replacementCount: number;
  annualFuelConsumption: number;
  annualCo2: number;
  totalOwnershipCost: number;
}

export interface CostComparison {
  annualEnergyDeficitKWh: number;
  alternatives: CostComparisonItem[];
}

export interface ReserveScenarioResult {
  source: BackupSourceName;
  monthlyEnergyBalance: MonthlyEnergyBalanceRow[];
  annualTotals: AnnualTotals;
  secondarySourcePowerW: number;
  costItem: CostComparisonItem | null;
}

export interface DerivedResults {
  equipmentBudgetRows: EquipmentBudgetRow[];
  totalWhPerDay: number;
  totalAhPerDay: number;
  totalWhPerWeek: number;
  totalAhPerWeek: number;
  monthlyEnergyBalance: MonthlyEnergyBalanceRow[];
  annualTotals: AnnualTotals;
  systemRecommendation: SystemRecommendationResult;
  costComparison: CostComparison;
  reserveScenarios: {
    fuelCell: ReserveScenarioResult;
    diesel: ReserveScenarioResult;
  };
}

export interface NvePlantDetails {
  name: string;
  stationId: string | null;
  owner: string | null;
  municipality: string | null;
  county: string | null;
  maxOutputMW: number | null;
  productionGWh: number | null;
  grossHeadM: number | null;
  commissionedYear: string | null;
  plantType: string | null;
  kdbNumber: string | null;
  concessionUrl: string | null;
  wikiUrl: string | null;
  imageUrl: string | null;
  minFlowText: string | null;
  minFlowItems: string[];
  intakeCount: number | null;
  intakeItems: string[];
  reservoirCount: number | null;
  reservoirItems: string[];
}

export interface PlantConfiguration {
  id: string;
  engineMode: EngineMode;
  name: string;
  location: string;
  locationPlaceId: string | null;
  locationLat: number | null;
  locationLng: number | null;
  nvePlantDetails: NvePlantDetails | null;
  createdAt: string;
  updatedAt: string;
  answers: Answers;
  systemParameters: SystemParameters;
  solar: SolarConfiguration;
  battery: BatteryConfiguration;
  fuelCell: BackupSourceConfiguration;
  diesel: BackupSourceConfiguration;
  other: OtherParameters;
  monthlySolarRadiation: MonthlySolarRadiation;
  equipmentBudgetSettings: EquipmentBudgetSettings;
  equipmentRows: EquipmentRow[];
  radioLink: RadioLinkConfiguration;
  cachedRadioAnalysis: unknown | null;
  derivedResults: DerivedResults;
  lastRecommendation: Recommendation | null;
}

export interface ValidationErrors {
  [key: string]: string;
}
