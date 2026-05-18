import {
  calculateEquipmentBudgetRows as calculateCoreEquipmentBudgetRows,
  calculateNumericResults,
  normalizeCalculationRequest
} from "../../../backend/services/calculations/_calculationCore.js";
import {
  BackupSourceConfiguration,
  BackupSourceName,
  SecondarySourceKey,
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
    lifetime: ""
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
  if (h.startsWith("s1+")) return "Rør via inntak til beskyttet målepunkt";
  if (h.startsWith("s2+")) return "Rør gjennom dam med nedstrøms måleprofil";
  if (h.startsWith("s3+")) return "Tappeluke med nedstrøms måleprofil";
  if (h.startsWith("s4+")) return "Utsparing i dam med dokumenterende måleprofil";
  if (h.startsWith("s5+")) return "Fiskepassasje med dokumentert MVF-måling";
  if (h.startsWith("s6+")) return "Coanda-spesifikk kombinasjonsløsning";
  if (h.startsWith("s7+")) return "Alternativ slippform til NVE-samråd";
  if (h.includes("+m1")) return "Rørbasert MVF-måling";
  if (h.includes("+m2")) return "Naturlig måleprofil nedstrøms slipp";
  if (h.includes("+m3")) return "Kunstig V-profil";
  if (h.includes("+m4")) return "Rektangulært eller sammensatt kunstig profil";
  if (h.includes("+m5")) return "Crump-overløp";
  if (h.includes("+m6")) return "Fiskepassasjebasert MVF-måling";
  if (h.includes("+m7")) return "Coanda-spesifikk kombinasjonsløsning";
  if (h.includes("m8")) return "Alternativ metode med NVE-samråd";
  if (h.startsWith("m1")) return "Rørbasert MVF-måling";
  if (h.startsWith("m2")) return "Naturlig måleprofil nedstrøms slipp";
  if (h.startsWith("m3")) return "Kunstig V-profil";
  if (h.startsWith("m4")) return "Rektangulært eller sammensatt kunstig profil";
  if (h.startsWith("m5")) return "Crump-overløp";
  if (h.startsWith("m6")) return "Tappeluke med nedstrøms måleprofil";
  if (h.startsWith("m7")) return "Utsparing i dam med nedstrøms måleprofil";
  if (h.startsWith("m8")) return "Fiskepassasjebasert MVF-måling";
  if (h.startsWith("m9")) return "Coanda-spesifikk kombinasjonsløsning";
  if (h.startsWith("m10")) return "Alternativ metode med NVE-samråd";
  if (h.includes("fiskepassasje")) return "Fiskepassasje med dokumentert MVF-måling";
  if (h.includes("coanda") || h.includes("tyroler")) return "Slipp ved coanda-/tyrolerrist";
  if (h.includes("rør") || h.includes("pipe")) return "Måling i rør eller lukket kanal";
  if (h.includes("crump") || h.includes("målerenne")) return "Crump-overløp eller målerenne";
  if (h.includes("v-overløp")) return "V-overløp / trekantoverløp";
  if (h.includes("naturlig elveløp")) return "Naturlig elveprofil";
  return mainSolution;
}

function derivePrimaryMeasurement(recommendation: Recommendation): string {
  const h = `${recommendation.measurementMethodCode ?? ""} ${recommendation.mainSolution}`.toLowerCase();
  const k = recommendation.controlMeasurementMethod;
  if (h.startsWith("m1a")) return "Elektromagnetisk vannmåler";
  if (h.startsWith("m1b")) return "Ultralydmåler i rør";
  if (h.startsWith("m1c")) return "Måleblende/måledyse";
  if (h.startsWith("m1d")) return "ADP i rør/kanal";
  if (h.startsWith("m1")) return "Direkte vannføringsmåler i rør";
  if (h.startsWith("m2")) return "Vannstand + vannføringskurve i naturlig elveprofil";
  if (h.startsWith("m3")) return "Vannstand + kunstig V-profil";
  if (h.startsWith("m4")) return "Vannstand + rektangulært/sammensatt profil";
  if (h.startsWith("m5")) return "Vannstand + Crump-overløp";
  if (h.startsWith("m6")) return "Vannstand/lukeåpning + nedstrøms måleprofil";
  if (h.startsWith("m7")) return "Vannstand ved utsparing + nedstrøms måleprofil";
  if (h.startsWith("m8")) return "Fiskepassasjebasert vannstandsmåling";
  if (h.startsWith("m9")) return "Coanda-spesifikk målekombinasjon";
  if (h.startsWith("m10")) return "Alternativ metode til NVE-samråd";
  if (h.includes("elektromagnetisk")) return "Elektromagnetisk vannmåler";
  if (h.includes("ultralyd")) return "Utvendig ultralydmåler";
  if (k) return k;
  return "Måleprinsipp må fastsettes";
}

function deriveControlMeasurement(recommendation: Recommendation): string {
  if (recommendation.controlMeasurementMethod === "Måleprinsipp må fastsettes fra valgt målested")
    return "Må avklares i detaljprosjektering";
  return recommendation.controlMeasurementMethod;
}

function deriveMeasurementEquipment(primaryMeasurement: string, controlMeasurement: string): string {
  if (primaryMeasurement === "Elektromagnetisk vannmåler")
    return "Elektromagnetisk mengdemåler i fullt rør";
  if (primaryMeasurement === "Utvendig ultralydmåler")
    return "Clamp-on ultralydmåler";
  if (primaryMeasurement === "Ultralydmåler i rør")
    return "Ultralydmåler med leverandørkrav til rettstrekk";
  if (primaryMeasurement === "Måleblende/måledyse")
    return "Måleblende eller måledyse med differansetrykkmåling";
  if (primaryMeasurement === "ADP i rør/kanal")
    return "ADP-sensor i kjent rør- eller kanalgeometri";
  if (primaryMeasurement === "Direkte vannføringsmåler i rør")
    return "Flowmåler i fullt rør";
  if (primaryMeasurement.includes("vannstand") || primaryMeasurement.includes("Vannstand"))
    return "Vannstandssensor, logger og kapasitetskurve";
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

  const siteFactors = Array.isArray(answers.site_factors) ? answers.site_factors : [];
  const has4gCoverage = systemParameters["4gCoverage"] === true;
  const hasRadioOrSatellite = siteFactors.includes("site_limited_power_comm");
  let communication = "Satellittmodem";
  if (calculatorMode) {
    communication = "Ikke beregnet";
  } else if (has4gCoverage) {
    communication = "4G-ruter";
  } else if (hasRadioOrSatellite) {
    communication = "Kommunikasjon må velges fra dokumentert infrastruktur";
  } else if (siteFactors.includes("site_limited_power_comm")) {
    communication = "Kommunikasjon må velges fra tilgjengelig infrastruktur";
  }

  const loggerSetup = calculatorMode
    ? "Ikke beregnet"
    : inspectionsPerYear <= 4
      ? "Automatisk timeslogging forutsettes med relevant backup"
      : "Automatisk timeslogging forutsettes";

  const energyMonitoring = calculatorMode ? "Ikke beregnet" : has4gCoverage ? "Ja" : "Nei";

  const releaseArrangement = calculatorMode ? "Ikke beregnet" : simplifyReleaseArrangement(recommendation.mainSolution);
  const primaryMeasurement = calculatorMode ? "Ikke beregnet" : derivePrimaryMeasurement(recommendation);
  const controlMeasurement = calculatorMode ? "Ikke beregnet" : deriveControlMeasurement(recommendation);
  const measurementEquipment = calculatorMode
    ? "Ikke beregnet"
    : deriveMeasurementEquipment(primaryMeasurement, controlMeasurement);

  const icingAdaptation = calculatorMode
    ? "Ikke beregnet"
    : answers.release_method === "intake_pipe"
      ? "Beskyttet rør- og sensorpunkt"
      : "Stabilt og frostvurdert vannstandspunkt";

  const operationsRequirements = calculatorMode ? [] : dedupe([
    ...(recommendation.criteriaSatisfied ?? []).map((item) => `Kriterium dokumentert: ${item}`),
    ...(recommendation.criteriaNotSatisfied ?? []).map((item) => `Kriterium ikke oppfylt: ${item}`),
    ...(recommendation.missingDocumentation ?? []).map((item) => `Mangler dokumentasjon: ${item}`),
    ...(recommendation.silentNveRequirements ?? []).map((item) => `Driftsforutsetning: ${item}`),
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
    secondarySourcePowerW: toNumber(sourceConfig.powerW),
    batteryCapacityAh,
    batteryAutonomyDays,
    icingAdaptation,
    operationsRequirements
  } as const;
}

type ApiSourceName = "Brenselcelle" | "Dieselaggregat" | "Ikkje berekna" | "FuelCell" | "DieselGenerator" | "NotComputed";

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
  if (source === "Brenselcelle" || source === "FuelCell") return "FuelCell";
  if (source === "Dieselaggregat" || source === "DieselGenerator") return "DieselGenerator";
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
  evaluationHorizonYears: number;
  technicalLifetimeHours: number;
  totalRuntimeHours: number;
  replacementCount: number;
  annualFuelConsumption: number;
  annualCo2: number;
  toc: number;
}): CostComparisonItem {
  const source = mapApiSource(item.source);
  return {
    source: source === "DieselGenerator" ? "DieselGenerator" : "FuelCell",
    purchaseCost: item.purchaseCost,
    operatingCostPerYear: item.operatingCostPerYear,
    evaluationHorizonYears: item.evaluationHorizonYears,
    technicalLifetimeHours: item.technicalLifetimeHours,
    totalRuntimeHours: item.totalRuntimeHours,
    replacementCount: item.replacementCount,
    annualFuelConsumption: item.annualFuelConsumption,
    annualCo2: item.annualCo2,
    totalOwnershipCost: item.toc
  };
}

function dedupeCostItems(items: CostComparisonItem[]): CostComparisonItem[] {
  const bySource = new Map<BackupSourceName, CostComparisonItem>();
  for (const item of items) {
    bySource.set(item.source, item);
  }
  return [...bySource.values()];
}

function secondarySourceOptions(configuration: PlantConfiguration): SecondarySourceKey[] {
  const sources = configuration.systemParameters.secondarySourceOptions.filter(
    (source): source is SecondarySourceKey => source === "fuelCell" || source === "diesel"
  );
  return sources.length > 0 ? sources : [configuration.systemParameters.selectedSecondarySource];
}

function toCalculationPayload(configuration: PlantConfiguration) {
  const sources = secondarySourceOptions(configuration);
  const preferredSecondarySource = sources.length === 1 ? sources[0] : "";

  return {
    preferred_secondary_source: preferredSecondarySource,
    secondary_sources: sources,
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
    alternatives: dedupeCostItems(numericResults.costComparison.alternatives.map(mapCostItem))
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
      : calculateRecommendation(configuration.answers);
  const derivedResults = calculateDerivedResults(configuration, recommendation);

  return {
    recommendation,
    derivedResults
  };
}
