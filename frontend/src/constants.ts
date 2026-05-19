import {
  Answers,
  BatteryConfiguration,
  EquipmentBudgetSettings,
  HeightScale,
  KFactorKey,
  MonthlySolarRadiation,
  MonthKey,
  OtherParameters,
  Polarization,
  RadioLinkConfiguration,
  SolarConfiguration,
  SystemParameters,
  BackupSourceKey,
  BackupSourceConfiguration
} from "./types";
import { createEmptyHydroGuideAnswers } from "./hydroguide/sourceAnchoredDecision";

export const STORAGE_KEYS = {
  CONFIGS: "hydroguide:configurations:v2",
  ACTIVE_ID: "hydroguide:active-id:v1",
  LANGUAGE: "hydroguide:language",
  AI_EXPORT_HASH: "hydroguide:ai-export-hash",
} as const;

export const API_ENDPOINTS = {
  AI_REPORT: "/api/report",
} as const;

export const FEEDBACK_TIMEOUT_MS = 3000;

export const NOT_COMPUTED_LABEL = "Ikke beregnet";

export const IMPORT_FILE_EXTENSION = ".txt";
export const IMPORT_FILE_MAX_BYTES = 64 * 1024;
export const MAX_CONFIGURATION_EQUIPMENT_ROWS = 200;

export const EMPTY_ANSWERS: Answers = createEmptyHydroGuideAnswers();

export const ANSWER_KEYS = Object.keys(EMPTY_ANSWERS) as (keyof Answers)[];

export const EMPTY_SYSTEM_PARAMETERS: SystemParameters = {
  "4gCoverage": null,
  nbIotCoverage: null,
  lineOfSightUnder15km: null,
  inspectionsPerYear: "",
  hasBackupSource: null,
  selectedSecondarySource: "fuelCell",
  secondarySourceOptions: ["fuelCell", "diesel"],
  batteryMode: "",
  batteryValue: ""
};

export const EMPTY_SOLAR: SolarConfiguration = {
  panelPowerWp: "",
  panelCount: "",
  systemEfficiency: ""
};

export const EMPTY_BATTERY: BatteryConfiguration = {
  nominalVoltage: "",
  maxDepthOfDischarge: ""
};

export const DEFAULT_BACKUP_SOURCES: Record<BackupSourceKey, BackupSourceConfiguration> = {
  fuelCell: {
    purchaseCost: 88000,
    powerW: 42,
    fuelConsumptionPerKWh: 0.9,
    fuelPrice: 65,
    lifetime: 6500
  },
  diesel: {
    purchaseCost: 35000,
    powerW: 3500,
    fuelConsumptionPerKWh: 0.5,
    fuelPrice: 30,
    lifetime: 43800
  }
};

export const DEFAULT_OTHER: OtherParameters = {
  co2Methanol: 1.088,
  co2Diesel: 2.68,
  evaluationHorizonYears: 10
};

export const MONTH_KEYS: MonthKey[] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const MONTH_LABELS: Record<MonthKey, string> = {
  jan: "Jan",
  feb: "Feb",
  mar: "Mar",
  apr: "Apr",
  may: "Mai",
  jun: "Jun",
  jul: "Jul",
  aug: "Aug",
  sep: "Sep",
  oct: "Okt",
  nov: "Nov",
  dec: "Des"
};

export const DEFAULT_MONTHLY_SOLAR_RADIATION: MonthlySolarRadiation = {
  jan: 0.11064530284,
  feb: 1.02081508839,
  mar: 21.44387486665,
  apr: 61.43870641884,
  may: 79.35391031094,
  jun: 79.30232678362,
  jul: 80.63345578117,
  aug: 71.41789862748,
  sep: 37.71410191662,
  oct: 3.05505664524,
  nov: 0.25973765459,
  dec: 0.01700974846
};

export const EMPTY_EQUIPMENT_BUDGET_SETTINGS: EquipmentBudgetSettings = {
  displayUnit: "wh",
  useRuntimeHoursPerDay: true
};

const DEFAULT_HEIGHT_SCALE: HeightScale = "AGL";
const DEFAULT_K_FACTOR: KFactorKey = "4/3";
const DEFAULT_POLARIZATION: Polarization = "horizontal";

export const EMPTY_RADIO_LINK_CONFIGURATION: RadioLinkConfiguration = {
  pointA: {
    coordinate: "",
    antennaHeight: "",
    heightScale: DEFAULT_HEIGHT_SCALE,
    antennaGainDbi: 8
  },
  pointB: {
    coordinate: "",
    antennaHeight: "",
    heightScale: DEFAULT_HEIGHT_SCALE,
    antennaGainDbi: 12
  },
  frequencyMHz: 450,
  fresnelFactor: 0.6,
  kFactor: DEFAULT_K_FACTOR,
  polarization: DEFAULT_POLARIZATION,
  rainFactor: 25,
  txPowerDbm: 27,
  rxSensitivityDbm: -110,
  lineLossDb: 3.5
};
