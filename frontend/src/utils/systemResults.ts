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

  const has4gCoverage = answers.q11PowerCommunication.includes("mobileCoverage");
  const hasRadioOrSatellite = answers.q11PowerCommunication.includes("satelliteRadio");
  let communication = "Satellittmodem";
  if (calculatorMode) {
    communication = "Ikke beregnet";
  } else if (has4gCoverage) {
    communication = "4G-ruter";
  } else if (hasRadioOrSatellite) {
    communication = "LoRaWAN";
  } else if (answers.q11PowerCommunication.includes("solarBattery") || answers.q11PowerCommunication.includes("gridPower")) {
    communication = "Kommunikasjon må velges fra tilgjengelig infrastruktur";
  } else if (answers.q11PowerCommunication.includes("none")) {
    communication = "Kommunikasjon mangler";
  }

  const loggerSetup = calculatorMode
    ? "Ikke beregnet"
    : answers.q65HourlyAutomaticLogging === "yes"
      ? "Automatisk logger minst hver time"
      : answers.q65HourlyAutomaticLogging === "no"
        ? "Mangler automatisk timeslogging"
        : inspectionsPerYear <= 4
          ? "Automatisk logging må avklares med backuplogger"
          : "Automatisk logging må avklares";

  const energyMonitoring = calculatorMode ? "Ikke beregnet" : has4gCoverage ? "Ja" : "Nei";

  const releaseArrangement = calculatorMode ? "Ikke beregnet" : simplifyReleaseArrangement(recommendation.mainSolution);
  const primaryMeasurement = calculatorMode ? "Ikke beregnet" : derivePrimaryMeasurement(recommendation);
  const controlMeasurement = calculatorMode ? "Ikke beregnet" : deriveControlMeasurement(recommendation);
  const measurementEquipment = calculatorMode
    ? "Ikke beregnet"
    : deriveMeasurementEquipment(primaryMeasurement, controlMeasurement);

  const icingAdaptation = calculatorMode
    ? "Ikke beregnet"
    : answers.q07ReleaseSolution === "pipeIntake"
      ? "Beskyttet rør- og sensorpunkt"
      : "Stabilt og frostvurdert vannstandspunkt";

  const operationsRequirements = calculatorMode ? [] : dedupe([
    answers.q07ReleaseSolution === "pipeIntake"
      ? "Rettstrekk, fullt rør og rolig strømbilde gjennom måleren for stabil signalkvalitet"
      : "",
    recommendation.measurementMethodCode === "M2"
      ? "Naturlig profil må ha stabil geometri og dokumentert sammenheng mellom vannstand og vannføring"
      : "",
    recommendation.measurementMethodCode === "M3" || recommendation.measurementMethodCode === "M4" || recommendation.measurementMethodCode === "M5"
      ? "Overløp eller renne må ha kjent geometri, fri utstrømning og korrekt plassert vannstandssensor"
      : "",
    answers.q07ReleaseSolution === "gate" || answers.q07ReleaseSolution === "damOpening"
      ? "Luke, åpning, terskel eller overløp må ha stabilt vannspeil og kjent geometri"
      : "",
    answers.q08FishMigration !== "no" && answers.q08FishMigration !== ""
      ? "Fiskepassasje må beskrives separat fra ordinær MVF-måling i rapporten"
      : "",
    (answers.q09CoandaExists === "yes" || answers.q09CoandaExists === "planned" || answers.q07ReleaseSolution === "coandaSpecific")
      ? "Coanda-løsning må vurderes prosjektspesifikt og slippet bør føres over eller rett nedstrøms terskelen"
      : "",
    answers.q65HourlyAutomaticLogging === "no"
      ? "Automatisk timeslogging mangler og må etableres før løsningen er NVE-klar"
      : "",
    answers.q68SecureDataStorageForNve === "no"
      ? "Sikker datalagring og fremlegging for NVE må etableres"
      : "",
    answers.q66AccuracyWithinFivePercent === "no"
      ? "Målenøyaktighet innenfor +/-5 prosent må prosjekteres før endelig anbefaling"
      : "",
    answers.q67CompletenessNinetySevenPercent === "no"
      ? "Systemet må prosjekteres for minst 97 prosent komplette/korrekte registreringer"
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
      : calculateRecommendation(configuration.answers);
  const derivedResults = calculateDerivedResults(configuration, recommendation);

  return {
    recommendation,
    derivedResults
  };
}
