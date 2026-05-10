import {
  calculateEquipmentBudgetRows as calculateCoreEquipmentBudgetRows,
  calculateNumericResults,
  normalizeCalculationRequest
} from "../../../backend/services/calculations/_calculationCore.js";
import {
  BackupSourceConfiguration,
  BackupSourceName,
  CostComparisonItem,
  DerivedResults,
  EditableNumber,
  EquipmentBudgetRow,
  EquipmentRow,
  MonthlyEnergyBalanceRow,
  AnnualTotals,
  MonthKey,
  PlantConfiguration,
  Recommendation
} from "../types";
import { dedupe } from "./format";
import { calculateRecommendation } from "./recommendation";

function toNumber(value: EditableNumber): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function inspectionsForLogic(value: EditableNumber): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function selectedSourceConfig(
  configuration: PlantConfiguration,
  source: BackupSourceName | "NotComputed"
): BackupSourceConfiguration {
  if (source === "FuelCell") {
    return configuration.fuelCell;
  }

  if (source === "DieselGenerator") {
    return configuration.diesel;
  }

  return {
    purchaseCost: "",
    powerW: "",
    fuelConsumptionPerKWh: "",
    fuelPrice: "",
    lifetime: "",
    annualMaintenance: ""
  };
}

export function calculateEquipmentBudgetRows(
  equipmentRows: EquipmentRow[],
  nominalVoltageValue: EditableNumber
): EquipmentBudgetRow[] {
  return calculateCoreEquipmentBudgetRows(equipmentRows, nominalVoltageValue) as EquipmentBudgetRow[];
}

function simplifyReleaseArrangement(mainSolution: string): string {
  const h = mainSolution.toLowerCase();
  if (h.includes("rørslipp") && h.includes("aktiv reguleringsventil"))
    return "Rørslipp i frostfritt rom med aktiv reguleringsventil";
  if (h.includes("rørslipp") && h.includes("fast struping"))
    return "Rørslipp i frostfritt rom med fast struping";
  if (h.includes("reguleringskum"))
    return "Reguleringskum med skjermet måleseksjon";
  if (h.includes("passiv slipp"))
    return "Passiv slippseksjon med vern mot is og drivgods";
  if (h.includes("standard slipp"))
    return "Fast slippordning med definert målepunkt";
  return mainSolution;
}

function derivePrimaryMeasurement(recommendation: Recommendation): string {
  const h = recommendation.mainSolution.toLowerCase();
  const k = recommendation.controlMeasurementMethod;
  if (h.includes("mengdemåler")) return "Mengdemåling i rør";
  if (k === "Volum/tid-måling i beholder") return "Volum/tid-måling i beholder";
  if (k === "Kontroll i naturlig måleprofil nedstrøms") return "Vannstand i naturlig måleprofil";
  if (k === "Kontroll i kunstig bygget måleprofil nedstrøms") return "Vannstand i kunstig måleprofil";
  if (k === "Fortynningsmåling") return "Fortynningsmåling";
  if (k === "Areal-hastighetmåling") return "Areal-hastighetmåling";
  return "Måleprinsipp må fastsettes";
}

function deriveControlMeasurement(recommendation: Recommendation): string {
  if (recommendation.controlMeasurementMethod === "Trenger nærmere prosjektering")
    return "Må avklares i detaljprosjektering";
  return recommendation.controlMeasurementMethod;
}

function deriveMeasurementEquipment(primaryMeasurement: string, controlMeasurement: string): string {
  if (primaryMeasurement === "Mengdemåling i rør")
    return "Mengdemåler i rør";
  if (primaryMeasurement === "Volum/tid-måling i beholder")
    return "Beholder med kjent volum og nivåregistrering";
  if (primaryMeasurement === "Vannstand i naturlig måleprofil")
    return "Sensor og logger mot naturlig profil";
  if (primaryMeasurement === "Vannstand i kunstig måleprofil")
    return "Sensor og logger mot kunstig profil";
  if (primaryMeasurement === "Fortynningsmåling")
    return "Fortynningsutstyr og logget prøveserie";
  if (primaryMeasurement === "Areal-hastighetmåling")
    return "Sensor for nivå og hastighet i definert måleseksjon";
  if (controlMeasurement === "Må avklares i detaljprosjektering")
    return "Må velges i detaljprosjektering";
  return controlMeasurement;
}

function calculateSystemRecommendation(
  configuration: PlantConfiguration,
  recommendation: Recommendation,
  sourceName: BackupSourceName | "NotComputed",
  batteryCapacityAh: number,
  batteryAutonomyDays: number
) {
  const { answers, systemParameters } = configuration;
  const calculatorMode = (configuration.engineMode ?? "calculator") === "calculator";
  const inspectionsPerYear = inspectionsForLogic(systemParameters.inspectionsPerYear);
  const sourceConfig = selectedSourceConfig(configuration, sourceName);

  const has4gCoverage = systemParameters["4gCoverage"] === true;
  const communication = calculatorMode
    ? "Ikke beregnet"
    : has4gCoverage
      ? "4G-ruter"
      : systemParameters.nbIotCoverage === true
        ? "NB-IoT"
        : systemParameters.lineOfSightUnder15km === true
          ? "LoRaWAN"
          : "Satellittmodem";

  const loggerSetup = calculatorMode
    ? "Ikke beregnet"
    : inspectionsPerYear <= 4
      ? "2 loggere + backuplogger"
      : "1 logger";

  const energyMonitoring = calculatorMode ? "Ikke beregnet" : has4gCoverage ? "Ja" : "Nei";

  const releaseArrangement = calculatorMode ? "Ikke beregnet" : simplifyReleaseArrangement(recommendation.mainSolution);
  const primaryMeasurement = calculatorMode ? "Ikke beregnet" : derivePrimaryMeasurement(recommendation);
  const controlMeasurement = calculatorMode ? "Ikke beregnet" : deriveControlMeasurement(recommendation);
  const measurementEquipment = calculatorMode
    ? "Ikke beregnet"
    : deriveMeasurementEquipment(primaryMeasurement, controlMeasurement);

  const icingAdaptation = calculatorMode
    ? "Ikke beregnet"
    :
    answers.q5IsSedimentClogging === "yes" && answers.q4ReleaseMethod === "pipeFrostFree"
      ? "Frostsikret sensorhus / varmekabel"
      : answers.q5IsSedimentClogging === "yes"
        ? "Isreduksjon i måleprofil"
        : "Standard";

  const operationsRequirements = calculatorMode ? [] : dedupe([
    releaseArrangement.startsWith("Rørslipp")
      ? "Serviceadkomst til ventil, måler og innløp i frostfritt rom"
      : "",
    primaryMeasurement === "Mengdemåling i rør"
      ? "Rettstrekk og rolig strømbilde gjennom måleren for stabil signalkvalitet"
      : "",
    controlMeasurement === "Kontroll i naturlig måleprofil nedstrøms"
      ? "Naturlig kontrollprofil nedstrøms med stabil geometri og adkomst for kontrollmåling"
      : "",
    controlMeasurement === "Kontroll i kunstig bygget måleprofil nedstrøms"
      ? "Kunstig kontrollprofil nedstrøms med definert geometri og adkomst for kontrollmåling"
      : "",
    controlMeasurement === "Fortynningsmåling"
      ? "Tilstrekkelig turbulens og dokumentert innblanding ved kontrollmåling"
      : "",
    controlMeasurement === "Areal-hastighetmåling"
      ? "Jevn dybde og definert tverrsnitt for areal-hastighetsmåling"
      : "",
    controlMeasurement === "Volum/tid-måling i beholder"
      ? "Samlet beholder med kjent volum og repeterbar tømmetid"
      : "",
    answers.q3ReleaseRequirementVariation === "seasonal" || answers.q3ReleaseRequirementVariation === "inflowControlled"
      ? "Regulering må kunne spores og styres trygt ved hyppige endringer"
      : "",
    recommendation.status === "NeedsClarification"
      ? `Avklar prosjekteringsgrunnlaget for ${recommendation.controlMeasurementMethod.toLowerCase()}`
      : ""
  ]);

  return {
    releaseArrangement,
    primaryMeasurement,
    controlMeasurement,
    measurementEquipment,
    communication,
    loggerSetup,
    energyMonitoring,
    secondarySource: sourceName,
    secondarySourcePowerW: round(toNumber(sourceConfig.powerW), 2),
    batteryCapacityAh,
    batteryAutonomyDays,
    icingAdaptation,
    operationsRequirements
  } as const;
}

type ApiSourceName = "Brenselcelle" | "Dieselaggregat" | "Ikkje berekna";

const API_TO_FRONTEND_MONTH: Record<string, MonthKey> = {
  jan: "jan",
  feb: "feb",
  mar: "mar",
  apr: "apr",
  mai: "may",
  may: "may",
  jun: "jun",
  jul: "jul",
  aug: "aug",
  sep: "sep",
  okt: "oct",
  oct: "oct",
  nov: "nov",
  des: "dec",
  dec: "dec"
};

function mapApiSource(source: ApiSourceName): BackupSourceName | "NotComputed" {
  if (source === "Brenselcelle") return "FuelCell";
  if (source === "Dieselaggregat") return "DieselGenerator";
  return "NotComputed";
}

function mapMonthlyEnergyBalance(
  rows: Array<Omit<MonthlyEnergyBalanceRow, "month"> & { month: string }>
): MonthlyEnergyBalanceRow[] {
  return rows.map((row) => ({
    ...row,
    month: API_TO_FRONTEND_MONTH[row.month] ?? "jan"
  }));
}

function mapAnnualTotals(totals: AnnualTotals): AnnualTotals {
  return { ...totals };
}

function mapCostItem(item: {
  source: ApiSourceName;
  purchaseCost: number;
  operatingCostPerYear: number;
  annualMaintenance: number;
  evaluationHorizonYears: number;
  technicalLifetimeHours: number;
  totalRuntimeHours: number;
  replacementCount: number;
  annualFuelConsumption: number;
  annualCo2: number;
  toc: number;
}): CostComparisonItem {
  return {
    source: mapApiSource(item.source) === "DieselGenerator" ? "DieselGenerator" : "FuelCell",
    purchaseCost: item.purchaseCost,
    operatingCostPerYear: item.operatingCostPerYear,
    annualMaintenance: item.annualMaintenance,
    evaluationHorizonYears: item.evaluationHorizonYears,
    technicalLifetimeHours: item.technicalLifetimeHours,
    totalRuntimeHours: item.totalRuntimeHours,
    replacementCount: item.replacementCount,
    annualFuelConsumption: item.annualFuelConsumption,
    annualCo2: item.annualCo2,
    totalOwnershipCost: item.toc
  };
}

function toCalculationPayload(configuration: PlantConfiguration) {
  return {
    systemParameters: configuration.systemParameters,
    solar: configuration.solar,
    battery: {
      ...configuration.battery,
      batteryMode: configuration.systemParameters.batteryMode,
      batteryValue: configuration.systemParameters.batteryValue
    },
    backupSource: {
      hasBackupSource: configuration.systemParameters.hasBackupSource
    },
    fuelCell: configuration.fuelCell,
    diesel: configuration.diesel,
    other: configuration.other,
    monthlySolarRadiation: configuration.monthlySolarRadiation,
    equipmentBudgetSettings: configuration.equipmentBudgetSettings,
    equipmentRows: configuration.equipmentRows
  };
}

function calculateDerivedResults(
  configuration: PlantConfiguration,
  recommendation: Recommendation
): DerivedResults {
  const numericResults = calculateNumericResults(normalizeCalculationRequest(toCalculationPayload(configuration)));
  const equipmentBudgetRows = numericResults.equipmentBudgetRows as EquipmentBudgetRow[];
  const totalWhPerDay = numericResults.totals.totalWhPerDay;
  const totalAhPerDay = numericResults.totals.totalAhPerDay;
  const recommendedSource = mapApiSource(numericResults.selectedSource);
  const systemRecommendation = calculateSystemRecommendation(
    configuration,
    recommendation,
    recommendedSource,
    numericResults.battery.capacityAh,
    numericResults.battery.autonomyDays
  );
  const monthlyEnergyBalance = mapMonthlyEnergyBalance(numericResults.monthlyEnergyBalance);
  const costComparison = {
    annualEnergyDeficitKWh: numericResults.costComparison.annualEnergyDeficitKWh,
    alternatives: numericResults.costComparison.alternatives.map(mapCostItem)
  };
  const reserveScenarios = {
    fuelCell: {
      source: "FuelCell" as const,
      monthlyEnergyBalance: mapMonthlyEnergyBalance(numericResults.scenarios.fuelCell.monthlyEnergyBalance),
      annualTotals: mapAnnualTotals(numericResults.scenarios.fuelCell.annualTotals),
      secondarySourcePowerW: numericResults.scenarios.fuelCell.secondarySourcePowerW,
      costItem: numericResults.scenarios.fuelCell.costItem ? mapCostItem(numericResults.scenarios.fuelCell.costItem) : null
    },
    diesel: {
      source: "DieselGenerator" as const,
      monthlyEnergyBalance: mapMonthlyEnergyBalance(numericResults.scenarios.diesel.monthlyEnergyBalance),
      annualTotals: mapAnnualTotals(numericResults.scenarios.diesel.annualTotals),
      secondarySourcePowerW: numericResults.scenarios.diesel.secondarySourcePowerW,
      costItem: numericResults.scenarios.diesel.costItem ? mapCostItem(numericResults.scenarios.diesel.costItem) : null
    }
  };

  return {
    equipmentBudgetRows,
    totalWhPerDay,
    totalAhPerDay,
    totalWhPerWeek: numericResults.totals.totalWhPerWeek,
    totalAhPerWeek: numericResults.totals.totalAhPerWeek,
    monthlyEnergyBalance,
    annualTotals: mapAnnualTotals(numericResults.annualTotals),
    systemRecommendation,
    costComparison,
    reserveScenarios
  };
}

export function calculateConfigurationOutputs(
  configuration: PlantConfiguration
): { recommendation: Recommendation; derivedResults: DerivedResults } {
  const recommendation =
    (configuration.engineMode ?? "calculator") === "calculator"
      ? {
          mainSolution: "Ikke beregnet",
          controlMeasurementMethod: "Ikke beregnet",
          justification: [],
          additionalRequirements: [],
          status: "NeedsClarification" as const
        }
      : calculateRecommendation(configuration.answers, configuration.systemParameters.inspectionsPerYear);
  const derivedResults = calculateDerivedResults(configuration, recommendation);

  return {
    recommendation,
    derivedResults
  };
}
