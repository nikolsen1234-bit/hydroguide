export type YesNo = "yes" | "no";
export type EditableNumber = number | "";
export type NullableBoolean = boolean | null;

export type FacilityType = "new" | "existing" | "conversion";
export type ReleaseRequirementVariation = "fixed" | "seasonal" | "inflowControlled";
export type ReleaseMethod = "pipeFrostFree" | "pipeNoFrostFree" | "gateWeirOverflow" | "directRiverbed";
export type MeasurementProfile = "naturalStable" | "canBuildArtificial" | "noSuitableProfile";
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
  q1FacilityType: FacilityType | "";
  q2HighestRequiredMinFlow: EditableNumber;
  q3ReleaseRequirementVariation: ReleaseRequirementVariation | "";
  q4ReleaseMethod: ReleaseMethod | "";
  q5IsSedimentClogging: YesNo | "";
  q6FishPassage: YesNo | "";
  q7BypassOnOutage: YesNo | "";
  q8MeasurementProfile: MeasurementProfile | "";
  q9PublicControl: YesNo | "";
}

export interface Recommendation {
  mainSolution: string;
  controlMeasurementMethod: string;
  justification: string[];
  additionalRequirements: string[];
  status: ConfidenceStatus;
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
  lifetimeYears: EditableNumber;
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
