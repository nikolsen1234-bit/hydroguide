import {
  EMPTY_ANSWERS,
  EMPTY_BATTERY,
  EMPTY_EQUIPMENT_BUDGET_SETTINGS,
  MAX_CONFIGURATION_EQUIPMENT_ROWS,
  DEFAULT_BACKUP_SOURCES,
  DEFAULT_MONTHLY_SOLAR_RADIATION,
  DEFAULT_OTHER,
  EMPTY_RADIO_LINK_CONFIGURATION,
  EMPTY_SOLAR,
  EMPTY_SYSTEM_PARAMETERS
} from "../constants";
import type { HydroGuideAnswers } from "../hydroguide/sourceAnchoredDecision";
import {
  Answers,
  BackupSourceConfiguration,
  BatteryConfiguration,
  SecondarySourceKey,
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

function normalizeSecondarySourceKey(value: unknown): SecondarySourceKey | null {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (source === "diesel" || source === "dieselaggregat" || source === "dieselgenerator") {
    return "diesel";
  }
  if (source === "fuelcell" || source === "fuel_cell" || source === "fuel-cell" || source === "brenselcelle") {
    return "fuelCell";
  }
  return null;
}

function normalizeSecondarySourceOptions(value: unknown, fallback: SecondarySourceKey): SecondarySourceKey[] {
  const rawValues =
    value === "both" || value === "begge"
      ? ["fuelCell", "diesel"]
      : Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : [];
  const sources: SecondarySourceKey[] = [];

  rawValues.forEach((item) => {
    const source = normalizeSecondarySourceKey(item);
    if (source && !sources.includes(source)) {
      sources.push(source);
    }
  });

  return sources.length > 0 ? sources : [fallback];
}

function normalizeMinimumFlowRequirement(value: unknown): unknown {
  const numericValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))
        ? Number(value)
        : null;

  if (numericValue === null || numericValue < 0) {
    return value;
  }

  if (numericValue <= 50) return "flow_0_50";
  if (numericValue <= 200) return "flow_50_200";
  if (numericValue <= 500) return "flow_200_500";
  return "flow_over_500";
}

function migrateAnswers(value: unknown): Answers {
  const v = (value ?? {}) as Record<string, unknown>;
  const existing = Object.keys(EMPTY_ANSWERS).some((key) => Object.prototype.hasOwnProperty.call(v, key))
    ? Object.fromEntries(Object.keys(EMPTY_ANSWERS).map((key) => [key, v[key] ?? EMPTY_ANSWERS[key]])) as HydroGuideAnswers
    : null;

  if (existing) {
    return {
      ...existing,
      flow_requirement: normalizeMinimumFlowRequirement(existing.flow_requirement) as HydroGuideAnswers[string]
    };
  }
  return { ...EMPTY_ANSWERS };
}

function normalizeSystemParameters(value: Partial<SystemParameters> | undefined): SystemParameters {
  const rawSelectedSecondarySource = value?.selectedSecondarySource ?? value?.selectedBackupSource;
  const selectedSecondarySource = rawSelectedSecondarySource === "diesel" ? "diesel" : "fuelCell";

  return {
    "4gCoverage": normalizeBoolean(value?.["4gCoverage"]),
    nbIotCoverage: normalizeBoolean(value?.nbIotCoverage),
    lineOfSightUnder15km: normalizeBoolean(value?.lineOfSightUnder15km),
    inspectionsPerYear: normalizeNumber(value?.inspectionsPerYear),
    hasBackupSource: normalizeBoolean(value?.hasBackupSource),
    selectedSecondarySource,
    secondarySourceOptions: normalizeSecondarySourceOptions(
      value?.secondarySourceOptions ?? value?.reserveComparisonSources,
      selectedSecondarySource
    ),
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
    lifetime: normalizeNumber(value?.lifetime)
  };
}

function normalizeOther(value: Partial<OtherParameters> | undefined): OtherParameters {
  return {
    co2Methanol: normalizeNumber(value?.co2Methanol ?? DEFAULT_OTHER.co2Methanol),
    co2Diesel: normalizeNumber(value?.co2Diesel ?? DEFAULT_OTHER.co2Diesel),
    evaluationHorizonYears: normalizeNumber(value?.evaluationHorizonYears ?? DEFAULT_OTHER.evaluationHorizonYears)
  };
}

function normalizeMonthlySolarRadiation(value: unknown): MonthlySolarRadiation {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    jan: normalizeNumber(v.jan ?? DEFAULT_MONTHLY_SOLAR_RADIATION.jan),
    feb: normalizeNumber(v.feb ?? DEFAULT_MONTHLY_SOLAR_RADIATION.feb),
    mar: normalizeNumber(v.mar ?? DEFAULT_MONTHLY_SOLAR_RADIATION.mar),
    apr: normalizeNumber(v.apr ?? DEFAULT_MONTHLY_SOLAR_RADIATION.apr),
    may: normalizeNumber(v.may ?? v.mai ?? DEFAULT_MONTHLY_SOLAR_RADIATION.may),
    jun: normalizeNumber(v.jun ?? DEFAULT_MONTHLY_SOLAR_RADIATION.jun),
    jul: normalizeNumber(v.jul ?? DEFAULT_MONTHLY_SOLAR_RADIATION.jul),
    aug: normalizeNumber(v.aug ?? DEFAULT_MONTHLY_SOLAR_RADIATION.aug),
    sep: normalizeNumber(v.sep ?? DEFAULT_MONTHLY_SOLAR_RADIATION.sep),
    oct: normalizeNumber(v.oct ?? v.okt ?? DEFAULT_MONTHLY_SOLAR_RADIATION.oct),
    nov: normalizeNumber(v.nov ?? DEFAULT_MONTHLY_SOLAR_RADIATION.nov),
    dec: normalizeNumber(v.dec ?? v.des ?? DEFAULT_MONTHLY_SOLAR_RADIATION.dec)
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
    fuelCell: { ...DEFAULT_BACKUP_SOURCES.fuelCell },
    diesel: { ...DEFAULT_BACKUP_SOURCES.diesel },
    other: { ...DEFAULT_OTHER },
    monthlySolarRadiation: { ...DEFAULT_MONTHLY_SOLAR_RADIATION },
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
