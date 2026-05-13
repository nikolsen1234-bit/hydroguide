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

export const IMPORT_FILE_EXTENSION = ".txt";
export const IMPORT_FILE_MAX_BYTES = 64 * 1024;
export const MAX_CONFIGURATION_EQUIPMENT_ROWS = 200;

export const FLOW_THRESHOLDS = {
  smallMax: 30,
  mediumMax: 120
};

export const EMPTY_ANSWERS: Answers = createEmptyHydroGuideAnswers();

export const ANSWER_KEYS = Object.keys(EMPTY_ANSWERS) as (keyof Answers)[];

export const EMPTY_SYSTEM_PARAMETERS: SystemParameters = {
  "4gCoverage": null,
  nbIotCoverage: null,
  lineOfSightUnder15km: null,
  inspectionsPerYear: "",
  hasBackupSource: null,
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

export const EMPTY_BACKUP_SOURCE: BackupSourceConfiguration = {
  purchaseCost: "",
  powerW: "",
  fuelConsumptionPerKWh: "",
  fuelPrice: "",
  lifetime: "",
  annualMaintenance: ""
};

export const EMPTY_OTHER: OtherParameters = {
  co2Methanol: "",
  co2Diesel: "",
  evaluationHorizonYears: ""
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

export const EMPTY_MONTHLY_SOLAR_RADIATION: MonthlySolarRadiation = {
  jan: "",
  feb: "",
  mar: "",
  apr: "",
  may: "",
  jun: "",
  jul: "",
  aug: "",
  sep: "",
  oct: "",
  nov: "",
  dec: ""
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
