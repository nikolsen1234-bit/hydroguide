export type JaNei = "ja" | "nei";
export type EditableNumber = number | "";
export type NullableBoolean = boolean | null;

export type Anleggstype = "nytt" | "eksisterande" | "ombygging";
export type Slippkravvariasjon = "fast" | "sesongkrav" | "tilsigsstyrt";
export type Slippmetode = "royr_frostfritt" | "royr_utan_frostfritt" | "luke_utsparing_overloep" | "direkte_elveleie";
export type Maleprofil = "naturleg_stabilt" | "kan_byggjast_kunstig" | "ingen_eigna_profil";
export type BatteryMode = "ah" | "autonomyDays";
export type MonthKey = "jan" | "feb" | "mar" | "apr" | "mai" | "jun" | "jul" | "aug" | "sep" | "okt" | "nov" | "des";
export type BudgetDisplayUnit = "wh" | "ah";
export type HeightScale = "AGL" | "ASL";
export type Polarization = "horizontal" | "vertical";
export type KFactorKey = "4/3" | "1" | "2/3" | "-2/3";
export type BackupSourceName = "Brenselcelle" | "Dieselaggregat";

export type SolarRadiationMode = "manual" | "auto";

/**
 * "standard"  — HydroGuide sin eigen forenkla månadsmodell (rask, ingen ekstern datahenting).
 * "detailed"  — PVGIS 6.0-basert timeleg simulering med batteri-SOC, pålitelegheitsanalyse,
 *               horisontprofil og klimadata frå PVGIS 5.3 TMY (EU JRC).
 * "combined"  — Begge: forenkla oversikt + detaljert pålitelegheitsanalyse.
 */
export type EngineMode = "standard" | "detailed" | "combined";

export interface SolarRadiationSettings {
  mode: SolarRadiationMode;
  lat: EditableNumber;
  lon: EditableNumber;
  tilt: EditableNumber;
  azimuth: EditableNumber;
  heightOffset: EditableNumber;
  locationName: string;
  mapZoom: number;
}

export type ConfidenceStatus = "Anbefalt" | "Bør vurderast nærare" | "Krev avklaring";

export interface Answers {
  q1Anleggstype: Anleggstype | "";
  q2HogasteMinstevassforing: EditableNumber;
  q3Slippkravvariasjon: Slippkravvariasjon | "";
  q4Slippmetode: Slippmetode | "";
  q5IsSedimentTilstopping: JaNei | "";
  q6Fiskepassasje: JaNei | "";
  q7BypassVedDriftsstans: JaNei | "";
  q8Maleprofil: Maleprofil | "";
  q9AllmentaKontroll: JaNei | "";
}

export interface Recommendation {
  hovudloysing: string;
  kontrollmalemetode: string;
  grunngiving: string[];
  tilleggskrav: string[];
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
  mai: EditableNumber;
  jun: EditableNumber;
  jul: EditableNumber;
  aug: EditableNumber;
  sep: EditableNumber;
  okt: EditableNumber;
  nov: EditableNumber;
  des: EditableNumber;
}

export interface EquipmentBudgetSettings {
  displayUnit: BudgetDisplayUnit;
  useRuntimeHoursPerDay: boolean;
}

export interface RadioLinkEndpointConfiguration {
  coordinate: string;
  antennaHeight: EditableNumber;
  heightScale: HeightScale;
}

export interface RadioLinkConfiguration {
  pointA: RadioLinkEndpointConfiguration;
  pointB: RadioLinkEndpointConfiguration;
  frequencyMHz: number;
  fresnelFactor: number;
  kFactor: KFactorKey;
  polarization: Polarization;
  rainFactor: number;
}

export interface EquipmentRow {
  id: string;
  active: boolean;
  name: string;
  powerW: EditableNumber;
  runtimeHoursPerDay: EditableNumber;
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
  secondarySource: BackupSourceName | "Ikkje berekna";
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
  annualFuelConsumption: number;
  annualCo2: number;
  toc: number;
}

export interface CostComparison {
  annualEnergyDeficitKWh: number;
  items: CostComparisonItem[];
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

// ---------------------------------------------------------------------------
// Hourly battery simulation & reliability metrics
// ---------------------------------------------------------------------------

export interface MonthlyReliability {
  month: MonthKey;
  /** % of days battery reached 100% SOC */
  batteryFullPct: number;
  /** % of days battery reached cutoff SOC */
  batteryEmptyPct: number;
  /** Hours below 20% SOC this month */
  hoursBelow20Pct: number;
  /** Total energy not delivered (Wh) this month */
  deficitWh: number;
  /** Hours with non-zero deficit this month */
  deficitHours: number;
  /** Solar production this month (Wh) */
  solarProductionWh: number;
  /** Load demand this month (Wh) */
  loadDemandWh: number;
}

export interface WorstPeriod {
  /** Start hour index in the 8760-array */
  startHour: number;
  /** Total deficit Wh in this period */
  deficitWh: number;
  /** Start date label (e.g. "15. jan") */
  label: string;
}

export interface ReliabilityMetrics {
  monthly: MonthlyReliability[];
  /** Total loss-of-load hours in the year */
  lolh: number;
  /** Total energy not delivered (Wh) */
  totalDeficitWh: number;
  /** Longest consecutive hours with SOC at cutoff */
  longestLowSocHours: number;
  /** Worst 7-day period */
  worst7Day: WorstPeriod;
  /** Worst 30-day period */
  worst30Day: WorstPeriod;
  /** Worst single month (0-based index) */
  worstMonthIndex: number;
  /** SOC histogram: 10 bins (0-10%, 10-20%, ..., 90-100%), each = fraction of hours */
  socHistogram: number[];
}

export interface PlantConfiguration {
  id: string;
  engineMode: EngineMode;
  name: string;
  location: string;
  locationPlaceId: string | null;
  locationLat: number | null;
  locationLng: number | null;
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
  solarRadiationSettings: SolarRadiationSettings;
  radioLink: RadioLinkConfiguration;
  cachedRadioAnalysis: unknown | null;
  derivedResults: DerivedResults;
  lastRecommendation: Recommendation | null;
}

export interface ValidationErrors {
  [key: string]: string;
}
