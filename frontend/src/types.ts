import type { HydroGuideAnswers } from "./hydroguide/sourceAnchoredDecision";

export type EditableNumber = number | "";
export type NullableBoolean = boolean | null;

export type DecisionStatus =
  | "ANBEFALT_KILDEFORANKRET"
  | "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG"
  | "FRARADET_KILDEFORANKRET"
  | "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
  | "IKKE_KILDEFORANKRET";
export type ReleaseSolutionCode = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";
export type MeasurementMethodCode = "M1" | "M1a" | "M1b" | "M1c" | "M1d" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "X1" | "X2" | "NONE";
export type BatteryMode = "ah" | "autonomyDays";
export type MonthKey = "jan" | "feb" | "mar" | "apr" | "may" | "jun" | "jul" | "aug" | "sep" | "oct" | "nov" | "dec";
export type BudgetDisplayUnit = "wh" | "ah";
export type HeightScale = "AGL" | "ASL";
export type Polarization = "horizontal" | "vertical";
export type KFactorKey = "4/3" | "1" | "2/3" | "-2/3";
export type SecondarySourceKey = "fuelCell" | "diesel";
export type SecondarySourceName = "FuelCell" | "DieselGenerator";
export type BackupSourceKey = SecondarySourceKey;
export type BackupSourceName = SecondarySourceName;

export type EngineMode = "calculator" | "hydroguide";

export type ConfidenceStatus = "Recommended" | "NeedsReview" | "NeedsClarification";

export type Answers = HydroGuideAnswers;

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
  sourceRefs?: string[];
  criteriaSatisfied?: string[];
  criteriaNotSatisfied?: string[];
  missingDocumentation?: string[];
  explanationSourceRefs?: string[];
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
  selectedSecondarySource: SecondarySourceKey;
  secondarySourceOptions: SecondarySourceKey[];
  selectedBackupSource?: SecondarySourceKey;
  reserveComparisonSources?: SecondarySourceKey[];
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

export interface SecondaryScenarioResult {
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
    fuelCell: SecondaryScenarioResult;
    diesel: SecondaryScenarioResult;
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
