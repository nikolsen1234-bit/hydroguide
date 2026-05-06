import { DAYS_IN_MONTH, MONTH_KEYS, MONTH_LABELS } from "../constants";
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
  PlantConfiguration,
  Recommendation
} from "../types";
import { dedupe } from "./format";
import { calculateRecommendation } from "./recommendation";

const BUDGET_MONTH_DAYS = 30;

function toNumber(value: EditableNumber): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRuntimeHoursPerDay(value: EditableNumber): number {
  return Math.max(0, toNumber(value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function inspectionsForLogic(value: EditableNumber): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : Number.POSITIVE_INFINITY;
}

function calculateAnnualEnergyDeficitKWh(configuration: PlantConfiguration, totalWhPerDay: number): number {
  const panelCount = toNumber(configuration.solar.panelCount);
  const panelPowerWp = toNumber(configuration.solar.panelPowerWp);
  const systemEfficiency = toNumber(configuration.solar.systemEfficiency);

  return round(
    MONTH_KEYS.reduce((sum, month) => {
      const daysInMonth = DAYS_IN_MONTH[month];
      const solarProductionKWh =
        toNumber(configuration.monthlySolarRadiation[month]) * panelCount * (panelPowerWp / 1000) * systemEfficiency;
      const loadDemandKWh = (totalWhPerDay * daysInMonth) / 1000;

      return sum + Math.max(0, loadDemandKWh - solarProductionKWh);
    }, 0),
    2
  );
}

function selectRecommendedBackupSource(
  configuration: PlantConfiguration,
  alternatives: CostComparisonItem[]
): BackupSourceName | "Ikke beregnet" {
  if (configuration.systemParameters.hasBackupSource !== true) {
    return "Ikke beregnet";
  }

  const bestItem = alternatives.reduce<CostComparisonItem | null>((best, item) => {
    if (best === null || item.toc < best.toc) {
      return item;
    }

    if (item.toc === best.toc && item.source === "Brenselcelle" && best.source !== "Brenselcelle") {
      return item;
    }

    return best;
  }, null);

  return bestItem?.source ?? "Brenselcelle";
}

function selectedSourceConfig(
  configuration: PlantConfiguration,
  source: BackupSourceName | "Ikke beregnet"
): BackupSourceConfiguration {
  if (source === "Brenselcelle") {
    return configuration.fuelCell;
  }

  if (source === "Dieselaggregat") {
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
  const nominalVoltage = toNumber(nominalVoltageValue);

  return equipmentRows.map((row) => {
    const powerW = toNumber(row.powerW);
    const currentA = nominalVoltage > 0 ? powerW / nominalVoltage : 0;
    const runtimeHoursPerDay = row.active ? normalizeRuntimeHoursPerDay(row.runtimeHoursPerDay) : 0;
    const whPerDay = row.active ? powerW * runtimeHoursPerDay : 0;
    const ahPerDay = row.active ? currentA * runtimeHoursPerDay : 0;

    return {
      id: row.id,
      active: row.active,
      name: row.name,
      powerW: round(powerW, 2),
      currentA: round(currentA, 3),
      runtimeHoursPerDay: round(runtimeHoursPerDay, 2),
      whPerDay: round(whPerDay, 2),
      ahPerDay: round(ahPerDay, 2),
      whPerMonth: round(whPerDay * BUDGET_MONTH_DAYS, 2),
      ahPerMonth: round(ahPerDay * BUDGET_MONTH_DAYS, 2),
      whPerWeek: round(whPerDay * 7, 2),
      ahPerWeek: round(ahPerDay * 7, 2)
    };
  });
}

function calculateBatteryCapacityAh(configuration: PlantConfiguration, totalWhPerDay: number): number {
  const { batteryMode, batteryValue } = configuration.systemParameters;
  const nominalVoltage = toNumber(configuration.battery.nominalVoltage);
  const maxDepthOfDischarge = toNumber(configuration.battery.maxDepthOfDischarge);

  if (batteryMode === "ah") {
    return round(toNumber(batteryValue), 2);
  }

  if (batteryMode === "autonomyDays" && nominalVoltage > 0 && maxDepthOfDischarge > 0) {
    return round((totalWhPerDay * toNumber(batteryValue)) / (nominalVoltage * maxDepthOfDischarge), 0);
  }

  return 0;
}

function calculateBatteryAutonomyDays(configuration: PlantConfiguration, totalWhPerDay: number, batteryCapacityAh: number): number {
  const nominalVoltage = toNumber(configuration.battery.nominalVoltage);
  const maxDepthOfDischarge = toNumber(configuration.battery.maxDepthOfDischarge);

  if (totalWhPerDay <= 0 || nominalVoltage <= 0 || maxDepthOfDischarge <= 0 || batteryCapacityAh <= 0) {
    return 0;
  }

  return round((batteryCapacityAh * nominalVoltage * maxDepthOfDischarge) / totalWhPerDay, 2);
}

function createAnnualTotals(
  monthlyEnergyBalance: MonthlyEnergyBalanceRow[],
  totalWhPerDay: number,
  totalAhPerDay: number
): AnnualTotals {
  return {
    totalWhPerDay,
    totalAhPerDay,
    totalWhPerWeek: round(totalWhPerDay * 7, 2),
    totalAhPerWeek: round(totalAhPerDay * 7, 2),
    annualSolarProductionKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.solarProductionKWh, 0), 2),
    annualLoadDemandKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.loadDemandKWh, 0), 2),
    annualEnergyBalanceKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.energyBalanceKWh, 0), 2),
    annualSecondaryRuntimeHours: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.secondaryRuntimeHours, 0), 2),
    annualFuelConsumption: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.fuelLiters, 0), 2),
    annualFuelCost: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.fuelCost, 0), 2)
  };
}

function createEmptyAnnualTotals(totalWhPerDay: number, totalAhPerDay: number): AnnualTotals {
  return createAnnualTotals([], totalWhPerDay, totalAhPerDay);
}

function simplifyReleaseArrangement(hovudloysing: string): string {
  const h = hovudloysing.toLowerCase();
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
  return hovudloysing;
}

function derivePrimaryMeasurement(recommendation: Recommendation): string {
  const h = recommendation.hovudloysing.toLowerCase();
  const k = recommendation.kontrollmalemetode;
  if (h.includes("mengdemåler")) return "Mengdemåling i rør";
  if (k === "Volum/tid-måling i beholder") return "Volum/tid-måling i beholder";
  if (k === "Kontroll i naturlig måleprofil nedstrøms") return "Vannstand i naturlig måleprofil";
  if (k === "Kontroll i kunstig bygget måleprofil nedstrøms") return "Vannstand i kunstig måleprofil";
  if (k === "Fortynningsmåling") return "Fortynningsmåling";
  if (k === "Areal-hastighetmåling") return "Areal-hastighetmåling";
  return "Måleprinsipp må fastsettes";
}

function deriveControlMeasurement(recommendation: Recommendation): string {
  if (recommendation.kontrollmalemetode === "Trenger nærmere prosjektering")
    return "Må avklares i detaljprosjektering";
  return recommendation.kontrollmalemetode;
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
  totalWhPerDay: number,
  sourceName: BackupSourceName | "Ikke beregnet"
) {
  const { answers, systemParameters } = configuration;
  const calculatorMode = (configuration.engineMode ?? "standard") === "standard";
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

  const releaseArrangement = calculatorMode ? "Ikke beregnet" : simplifyReleaseArrangement(recommendation.hovudloysing);
  const primaryMeasurement = calculatorMode ? "Ikke beregnet" : derivePrimaryMeasurement(recommendation);
  const controlMeasurement = calculatorMode ? "Ikke beregnet" : deriveControlMeasurement(recommendation);
  const measurementEquipment = calculatorMode
    ? "Ikke beregnet"
    : deriveMeasurementEquipment(primaryMeasurement, controlMeasurement);

  const icingAdaptation = calculatorMode
    ? "Ikke beregnet"
    :
    answers.q5IsSedimentTilstopping === "ja" && answers.q4Slippmetode === "royr_frostfritt"
      ? "Frostsikret sensorhus / varmekabel"
      : answers.q5IsSedimentTilstopping === "ja"
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
    answers.q3Slippkravvariasjon === "sesongkrav" || answers.q3Slippkravvariasjon === "tilsigsstyrt"
      ? "Regulering må kunne spores og styres trygt ved hyppige endringer"
      : "",
    recommendation.status === "Krev avklaring"
      ? `Avklar prosjekteringsgrunnlaget for ${recommendation.kontrollmalemetode.toLowerCase()}`
      : ""
  ]);

  const batteryCapacityAh = calculateBatteryCapacityAh(configuration, totalWhPerDay);

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
    batteryAutonomyDays: calculateBatteryAutonomyDays(configuration, totalWhPerDay, batteryCapacityAh),
    icingAdaptation,
    operationsRequirements
  } as const;
}

function calculateMonthlyEnergyBalance(
  configuration: PlantConfiguration,
  totalWhPerDay: number,
  sourceName: BackupSourceName | "Ikke beregnet"
): MonthlyEnergyBalanceRow[] {
  const sourceConfig = selectedSourceConfig(configuration, sourceName);
  const secondarySourcePowerKw = toNumber(sourceConfig.powerW) / 1000;
  const fuelConsumptionPerKWh = toNumber(sourceConfig.fuelConsumptionPerKWh);
  const fuelPrice = toNumber(sourceConfig.fuelPrice);
  const panelCount = toNumber(configuration.solar.panelCount);
  const panelPowerWp = toNumber(configuration.solar.panelPowerWp);
  const systemEfficiency = toNumber(configuration.solar.systemEfficiency);

  return MONTH_KEYS.map((month) => {
    const daysInMonth = DAYS_IN_MONTH[month];
    const solarProductionKWh =
      toNumber(configuration.monthlySolarRadiation[month]) * panelCount * (panelPowerWp / 1000) * systemEfficiency;
    const loadDemandKWh = (totalWhPerDay * daysInMonth) / 1000;
    const energyBalanceKWh = solarProductionKWh - loadDemandKWh;
    const deficitKWh = Math.max(0, Math.abs(Math.min(0, energyBalanceKWh)));
    const secondaryRuntimeHours = secondarySourcePowerKw > 0 ? deficitKWh / secondarySourcePowerKw : 0;
    const fuelLiters = deficitKWh * fuelConsumptionPerKWh;
    const fuelCost = fuelLiters * fuelPrice;

    return {
      month,
      label: MONTH_LABELS[month],
      daysInMonth,
      solarProductionKWh,
      loadDemandKWh,
      energyBalanceKWh,
      secondaryRuntimeHours,
      fuelLiters,
      fuelCost
    };
  });
}

function calculateCostComparison(configuration: PlantConfiguration, annualEnergyDeficitKWh: number) {
  if (configuration.systemParameters.hasBackupSource !== true) {
    return {
      annualEnergyDeficitKWh: round(annualEnergyDeficitKWh, 2),
      alternatives: []
    };
  }

  const evaluationHorizonYears = toNumber(configuration.other.evaluationHorizonYears);
  const buildItem = (source: BackupSourceName): CostComparisonItem => {
    const config = selectedSourceConfig(configuration, source);
    const annualFuelConsumption = annualEnergyDeficitKWh * toNumber(config.fuelConsumptionPerKWh);
    const operatingCostPerYear = annualFuelConsumption * toNumber(config.fuelPrice);
    const annualMaintenance = toNumber(config.annualMaintenance);
    const purchaseCost = toNumber(config.purchaseCost);
    const technicalLifetimeHours = toNumber(config.lifetime);
    const totalRuntimeHours =
      annualEnergyDeficitKWh <= 0 || toNumber(config.powerW) <= 0
        ? 0
        : (annualEnergyDeficitKWh / (toNumber(config.powerW) / 1000)) * evaluationHorizonYears;
    const annualCo2 = annualFuelConsumption * (source === "Brenselcelle" ? toNumber(configuration.other.co2Methanol) : toNumber(configuration.other.co2Diesel));

    return {
      source,
      purchaseCost: round(purchaseCost, 2),
      operatingCostPerYear: round(operatingCostPerYear, 2),
      annualMaintenance: round(annualMaintenance, 2),
      evaluationHorizonYears: round(evaluationHorizonYears, 2),
      technicalLifetimeHours: round(technicalLifetimeHours, 2),
      totalRuntimeHours: round(totalRuntimeHours, 2),
      annualFuelConsumption: round(annualFuelConsumption, 2),
      annualCo2: round(annualCo2, 2),
      toc: round(purchaseCost + (operatingCostPerYear + annualMaintenance) * evaluationHorizonYears, 2)
    };
  };

  return {
    annualEnergyDeficitKWh: round(annualEnergyDeficitKWh, 2),
    alternatives: [buildItem("Brenselcelle"), buildItem("Dieselaggregat")]
  };
}

function createEmptyReserveScenario(source: BackupSourceName, totalWhPerDay: number, totalAhPerDay: number) {
  return {
    source,
    monthlyEnergyBalance: [],
    annualTotals: createEmptyAnnualTotals(totalWhPerDay, totalAhPerDay),
    secondarySourcePowerW: 0,
    costItem: null
  };
}

function createReserveScenario(
  configuration: PlantConfiguration,
  source: BackupSourceName,
  totalWhPerDay: number,
  totalAhPerDay: number,
  costItem: CostComparisonItem | null
) {
  const monthlyEnergyBalance = calculateMonthlyEnergyBalance(configuration, totalWhPerDay, source);

  return {
    source,
    monthlyEnergyBalance,
    annualTotals: createAnnualTotals(monthlyEnergyBalance, totalWhPerDay, totalAhPerDay),
    secondarySourcePowerW: round(toNumber(selectedSourceConfig(configuration, source).powerW), 2),
    costItem
  };
}

function calculateDerivedResults(
  configuration: PlantConfiguration,
  recommendation: Recommendation
): DerivedResults {
  const equipmentBudgetRows = calculateEquipmentBudgetRows(
    configuration.equipmentRows,
    configuration.battery.nominalVoltage
  );
  const totalWhPerDay = round(equipmentBudgetRows.reduce((sum, row) => sum + row.whPerDay, 0), 2);
  const totalAhPerDay = round(equipmentBudgetRows.reduce((sum, row) => sum + row.ahPerDay, 0), 2);
  const annualEnergyDeficitKWh = calculateAnnualEnergyDeficitKWh(configuration, totalWhPerDay);
  const costComparison = calculateCostComparison(configuration, annualEnergyDeficitKWh);
  const recommendedSource = selectRecommendedBackupSource(configuration, costComparison.alternatives);
  const systemRecommendation = calculateSystemRecommendation(
    configuration,
    recommendation,
    totalWhPerDay,
    recommendedSource
  );
  const monthlyEnergyBalance = calculateMonthlyEnergyBalance(configuration, totalWhPerDay, recommendedSource);
  const costItemsBySource = new Map(costComparison.alternatives.map((item) => [item.source, item] as const));
  const reserveScenarios =
    configuration.systemParameters.hasBackupSource === true
      ? {
          fuelCell: createReserveScenario(
            configuration,
            "Brenselcelle",
            totalWhPerDay,
            totalAhPerDay,
            costItemsBySource.get("Brenselcelle") ?? null
          ),
          diesel: createReserveScenario(
            configuration,
            "Dieselaggregat",
            totalWhPerDay,
            totalAhPerDay,
            costItemsBySource.get("Dieselaggregat") ?? null
          )
        }
      : {
          fuelCell: createEmptyReserveScenario("Brenselcelle", totalWhPerDay, totalAhPerDay),
          diesel: createEmptyReserveScenario("Dieselaggregat", totalWhPerDay, totalAhPerDay)
        };

  return {
    equipmentBudgetRows,
    totalWhPerDay,
    totalAhPerDay,
    totalWhPerWeek: round(totalWhPerDay * 7, 2),
    totalAhPerWeek: round(totalAhPerDay * 7, 2),
    monthlyEnergyBalance,
    annualTotals: createAnnualTotals(monthlyEnergyBalance, totalWhPerDay, totalAhPerDay),
    systemRecommendation,
    costComparison,
    reserveScenarios
  };
}

export function calculateConfigurationOutputs(
  configuration: PlantConfiguration
): { recommendation: Recommendation; derivedResults: DerivedResults } {
  const recommendation =
    (configuration.engineMode ?? "standard") === "standard"
      ? {
          hovudloysing: "Ikke beregnet",
          kontrollmalemetode: "Ikke beregnet",
          grunngiving: [],
          tilleggskrav: [],
          status: "Krev avklaring" as const
        }
      : calculateRecommendation(configuration.answers, configuration.systemParameters.inspectionsPerYear);
  const derivedResults = calculateDerivedResults(configuration, recommendation);

  return {
    recommendation,
    derivedResults
  };
}
