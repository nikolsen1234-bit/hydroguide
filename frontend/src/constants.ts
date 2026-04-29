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
  SolarRadiationSettings,
  SystemParameters,
  BackupSourceConfiguration
} from "./types";

export const STORAGE_KEYS = {
  CONFIGS: "energi-konfig:konfigurasjonar:v2",
  ACTIVE_ID: "energi-konfig:aktiv-id:v2",
  LANGUAGE: "energi-konfig:language",
  CALCULATOR_MODE: "energi-konfig:calculator-mode",
  AI_EXPORT_HASH: "energi-konfig:ai-export-hash",
} as const;

export const API_ENDPOINTS = {
  AI_REPORT: "/api/polish-report",
} as const;

export const FEEDBACK_TIMEOUT_MS = 3000;

export const IMPORT_FILE_EXTENSION = ".txt";
export const IMPORT_FILE_MAX_BYTES = 64 * 1024;
export const MAX_CONFIGURATION_EQUIPMENT_ROWS = 200;

export const FLOW_THRESHOLDS = {
  smallMax: 30,
  mediumMax: 120
};

export const EMPTY_ANSWERS: Answers = {
  q1Anleggstype: "",
  q2HogasteMinstevassforing: "",
  q3Slippkravvariasjon: "",
  q4Slippmetode: "",
  q5IsSedimentTilstopping: "",
  q6Fiskepassasje: "",
  q7BypassVedDriftsstans: "",
  q8Maleprofil: "",
  q9AllmentaKontroll: ""
};

export const ANSWER_KEYS: (keyof Answers)[] = [
  "q1Anleggstype",
  "q2HogasteMinstevassforing",
  "q3Slippkravvariasjon",
  "q4Slippmetode",
  "q5IsSedimentTilstopping",
  "q6Fiskepassasje",
  "q7BypassVedDriftsstans",
  "q8Maleprofil",
  "q9AllmentaKontroll"
];

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

export const MONTH_KEYS: MonthKey[] = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

export const MONTH_LABELS: Record<MonthKey, string> = {
  jan: "Jan",
  feb: "Feb",
  mar: "Mar",
  apr: "Apr",
  mai: "Mai",
  jun: "Jun",
  jul: "Jul",
  aug: "Aug",
  sep: "Sep",
  okt: "Okt",
  nov: "Nov",
  des: "Des"
};

export const DAYS_IN_MONTH: Record<MonthKey, number> = {
  jan: 31,
  feb: 28,
  mar: 31,
  apr: 30,
  mai: 31,
  jun: 30,
  jul: 31,
  aug: 31,
  sep: 30,
  okt: 31,
  nov: 30,
  des: 31
};

export const EMPTY_SOLAR_RADIATION_SETTINGS: SolarRadiationSettings = {
  mode: "manual",
  lat: "",
  lon: "",
  tilt: "",
  azimuth: "",
  heightOffset: "",
  locationName: "",
  mapZoom: 13,
};

export const EMPTY_MONTHLY_SOLAR_RADIATION: MonthlySolarRadiation = {
  jan: "",
  feb: "",
  mar: "",
  apr: "",
  mai: "",
  jun: "",
  jul: "",
  aug: "",
  sep: "",
  okt: "",
  nov: "",
  des: ""
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
    heightScale: DEFAULT_HEIGHT_SCALE
  },
  pointB: {
    coordinate: "",
    antennaHeight: "",
    heightScale: DEFAULT_HEIGHT_SCALE
  },
  frequencyMHz: 450,
  fresnelFactor: 0.6,
  kFactor: DEFAULT_K_FACTOR,
  polarization: DEFAULT_POLARIZATION,
  rainFactor: 25
};
