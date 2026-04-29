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
  EMPTY_SOLAR_RADIATION_SETTINGS,
  EMPTY_SYSTEM_PARAMETERS
} from "../constants";
import {
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
  OtherParameters,
  PlantConfiguration,
  Polarization,
  RadioLinkConfiguration,
  SolarConfiguration,
  SolarRadiationSettings,
  SystemParameters
} from "../types";
import type { Answers } from "../types";
import { formatLocationLabel } from "./format";
import { calculateConfigurationOutputs, calculateEquipmentBudgetRows } from "./systemResults";
import { validateConfiguration } from "./validation";

/**
 * Migrates V1 expanded answer keys (q1-q19) to V2 compact answer keys (q1-q9).
 * If the input already has V2 keys (no q7FrostfrittUttakEtterVaregrind), returns as-is.
 */
export function migrateV1Answers(e: Record<string, unknown>): Partial<Answers> {
  if (!("q2Inntakstype" in e) && !("q7FrostfrittUttakEtterVaregrind" in e)) {
    return e as Partial<Answers>;
  }

  let slippmetode = "";
  if (e.q2Inntakstype === "elvinntak") {
    slippmetode = "direkte_elveleie";
  } else if (e.q7FrostfrittUttakEtterVaregrind === "ja") {
    slippmetode = "royr_frostfritt";
  } else if (e.q7FrostfrittUttakEtterVaregrind === "nei") {
    slippmetode = "luke_utsparing_overloep";
  }

  let maleprofil = "";
  if (e.q11StabiltNaturlegMaleprofil === "ja") {
    maleprofil = "naturleg_stabilt";
  } else if (e.q12KanByggjeKunstigMaleprofil === "ja") {
    maleprofil = "kan_byggjast_kunstig";
  } else if (e.q11StabiltNaturlegMaleprofil === "nei" && e.q12KanByggjeKunstigMaleprofil === "nei") {
    maleprofil = "ingen_eigna_profil";
  }

  return {
    q1Anleggstype: (e.q1Anleggstype as string) ?? "",
    q2HogasteMinstevassforing: (e.q4HogasteMinstevassforing as number | "") ?? "",
    q3Slippkravvariasjon:
      e.q10MaRegulerastOfte === "ja"
        ? "tilsigsstyrt"
        : e.q6StorSkilnadSlippkrav === "ja"
          ? "sesongkrav"
          : (e.q5Reguleringskrav as string) ?? "",
    q4Slippmetode: slippmetode,
    q5IsSedimentTilstopping: (e.q8UtsettForIsSedimentTilstopping as string) ?? "",
    q6Fiskepassasje: (e.q3FiskepassasjeKrav as string) ?? "",
    q7BypassVedDriftsstans: (e.q15SleppForbiVedDriftsstans as string) ?? "",
    q8Maleprofil: maleprofil,
    q9AllmentaKontroll: (e.q14AllmentaKontrollPaStaden as string) ?? "",
  } as Partial<Answers>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix = "cfg"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function normalizeSolarRadiationSettings(value: Partial<SolarRadiationSettings> | undefined): SolarRadiationSettings {
  const normalizedMapZoom =
    typeof value?.mapZoom === "number" && Number.isFinite(value.mapZoom)
      ? (value.mapZoom === 5 ? 13 : value.mapZoom)
      : 13;

  return {
    mode: value?.mode === "auto" ? "auto" : "manual",
    lat: normalizeNumber(value?.lat),
    lon: normalizeNumber(value?.lon),
    tilt: normalizeNumber(value?.tilt),
    azimuth: normalizeNumber(value?.azimuth),
    heightOffset: normalizeNumber(value?.heightOffset),
    locationName: typeof value?.locationName === "string" ? value.locationName : "",
    mapZoom: normalizedMapZoom,
  };
}

function normalizeMonthlySolarRadiation(value: Partial<MonthlySolarRadiation> | undefined): MonthlySolarRadiation {
  return {
    jan: normalizeNumber(value?.jan),
    feb: normalizeNumber(value?.feb),
    mar: normalizeNumber(value?.mar),
    apr: normalizeNumber(value?.apr),
    mai: normalizeNumber(value?.mai),
    jun: normalizeNumber(value?.jun),
    jul: normalizeNumber(value?.jul),
    aug: normalizeNumber(value?.aug),
    sep: normalizeNumber(value?.sep),
    okt: normalizeNumber(value?.okt),
    nov: normalizeNumber(value?.nov),
    des: normalizeNumber(value?.des)
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

function normalizeRadioLink(value: Partial<RadioLinkConfiguration> | undefined): RadioLinkConfiguration {
  return {
    pointA: {
      coordinate: typeof value?.pointA?.coordinate === "string" ? value.pointA.coordinate : "",
      antennaHeight: normalizeNumber(value?.pointA?.antennaHeight),
      heightScale: normalizeHeightScale(value?.pointA?.heightScale)
    },
    pointB: {
      coordinate: typeof value?.pointB?.coordinate === "string" ? value.pointB.coordinate : "",
      antennaHeight: normalizeNumber(value?.pointB?.antennaHeight),
      heightScale: normalizeHeightScale(value?.pointB?.heightScale)
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
        : EMPTY_RADIO_LINK_CONFIGURATION.rainFactor
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
      runtimeHoursPerDay: normalizeNumber(maybeRow.runtimeHoursPerDay)
    };
  });
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
      releaseArrangement: "Ikkje berekna", primaryMeasurement: "Ikkje berekna",
      controlMeasurement: "Ikkje berekna", measurementEquipment: "Ikkje berekna",
      communication: "Ikkje berekna", loggerSetup: "Ikkje berekna",
      energyMonitoring: "Ikkje berekna", secondarySource: "Ikkje berekna",
      secondarySourcePowerW: 0, batteryCapacityAh: 0, batteryAutonomyDays: 0,
      icingAdaptation: "Ikkje berekna", operationsRequirements: []
    },
    costComparison: { annualEnergyDeficitKWh: 0, items: [] },
    reserveScenarios: {
      fuelCell: emptyReserveScenario("Brenselcelle", totalWhPerDay, totalAhPerDay),
      diesel: emptyReserveScenario("Dieselaggregat", totalWhPerDay, totalAhPerDay)
    }
  };
}

function baseConfiguration(_index: number): Omit<PlantConfiguration, "lastRecommendation" | "derivedResults"> {
  const timestamp = nowIso();

  return {
    id: makeId(),
    engineMode: "standard",
    name: "",
    location: "",
    locationPlaceId: null,
    locationLat: null,
    locationLng: null,
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
    solarRadiationSettings: { ...EMPTY_SOLAR_RADIATION_SETTINGS },
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
    engineMode: value.engineMode === "detailed" || value.engineMode === "combined" ? value.engineMode : "standard",
    name: typeof value.name === "string" ? value.name : "",
    location: typeof value.location === "string" ? formatLocationLabel(value.location) : "",
    locationPlaceId: typeof value.locationPlaceId === "string" ? value.locationPlaceId : null,
    locationLat: typeof value.locationLat === "number" ? value.locationLat : null,
    locationLng: typeof value.locationLng === "number" ? value.locationLng : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    answers: { ...EMPTY_ANSWERS, ...(value.answers ?? {}) },
    systemParameters: normalizeSystemParameters(value.systemParameters),
    solar: normalizeSolar(value.solar),
    battery: normalizeBattery(value.battery),
    fuelCell: normalizeBackupSource(value.fuelCell),
    diesel: normalizeBackupSource(value.diesel),
    other: normalizeOther(value.other),
    monthlySolarRadiation: normalizeMonthlySolarRadiation(value.monthlySolarRadiation),
    solarRadiationSettings: normalizeSolarRadiationSettings(value.solarRadiationSettings),
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
