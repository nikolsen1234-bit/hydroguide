// Standalone preview: builds a sample report HTML and writes it to disk.
// Usage: node scripts/preview-report.mjs [output-path]
//
// Loads the TS source via tsx; runs buildReportHtml with mock data that mirrors
// the shape produced by AnalysisPage at runtime, then writes the resulting HTML
// to the given path (default: ../../Music/HydroGuide-report-preview.html).

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv[2];
const outPath = outArg
  ? resolve(outArg)
  : resolve(__dirname, "..", "..", "..", "..", "Music", "HydroGuide-report-preview.html");

const reportModule = await import("../src/utils/report.ts");

const config = {
  id: "cfg-skjervet-0427",
  engineMode: "lookup",
  name: "Skjervet",
  location: "Vossestrand, Vestland",
  locationPlaceId: "1042",
  locationLat: 60.7234,
  locationLng: 6.4123,
  nvePlantDetails: {
    name: "Skjervet kraftverk",
    stationId: "1042",
    owner: "Voss Energi AS",
    municipality: "Voss",
    county: "Vestland",
    maxOutputMW: 8.4,
    productionGWh: 32,
    grossHeadM: 184,
    commissionedYear: "1992",
    plantType: "Elvekraftverk",
    kdbNumber: null,
    concessionUrl: null,
    wikiUrl: null,
    imageUrl: null,
    minFlowItems: [],
    minFlowText: null,
    intakeItems: [],
    intakeCount: null,
    reservoirItems: [],
    reservoirCount: null
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  answers: {
    q1FacilityType: "new",
    q2HighestRequiredMinFlow: 19,
    q3ReleaseRequirementVariation: "seasonal",
    q4ReleaseMethod: "pipe",
    q5IsSedimentClogging: "no",
    q6FishPassage: "no",
    q7BypassOnOutage: "yes",
    q8MeasurementProfile: "stable",
    q9PublicControl: "yes"
  },
  systemParameters: {
    "4gCoverage": "yes",
    nbIotCoverage: "yes",
    lineOfSightUnder15km: "yes",
    inspectionsPerYear: 2,
    hasBackupSource: "yes",
    batteryMode: "autonomyDays",
    batteryValue: 5
  },
  solar: { panelPowerWp: 425, panelCount: 10, systemEfficiency: 0.84 },
  battery: { nominalVoltage: 12.8, maxDepthOfDischarge: 0.8 },
  fuelCell: {
    purchaseCost: 158000,
    annualMaintenance: 2800,
    fuelCostPerLiter: 18,
    fuelConsumptionPerKWh: 0.95,
    co2PerLiter: 1.5,
    technicalLifetimeHours: 20000,
    powerW: 425,
    fuelPrice: 18,
    lifetime: 20000
  },
  diesel: {
    purchaseCost: 94000,
    annualMaintenance: 9600,
    fuelCostPerLiter: 18,
    fuelConsumptionPerKWh: 0.4,
    co2PerLiter: 2.7,
    technicalLifetimeHours: 8000,
    powerW: 5000,
    fuelPrice: 18,
    lifetime: 8000
  },
  other: { evaluationHorizonYears: 15, co2Methanol: 1.5, co2Diesel: 2.7 },
  monthlySolarRadiation: {
    jan: 0.4, feb: 1.0, mar: 2.7, apr: 4.2, mai: 5.6, jun: 5.2,
    jul: 5.1, aug: 4.1, sep: 2.4, okt: 1.2, nov: 0.5, des: 0.3
  },
  equipmentBudgetSettings: {},
  equipmentRows: [],
  radioLink: {},
  cachedRadioAnalysis: null,
  derivedResults: {},
  lastRecommendation: null
};

const monthlyEnergyBalance = [
  { month: "jan", label: "Jan", solarProductionKWh: 18, loadDemandKWh: 95 },
  { month: "feb", label: "Feb", solarProductionKWh: 38, loadDemandKWh: 88 },
  { month: "mar", label: "Mar", solarProductionKWh: 88, loadDemandKWh: 95 },
  { month: "apr", label: "Apr", solarProductionKWh: 132, loadDemandKWh: 92 },
  { month: "mai", label: "Mai", solarProductionKWh: 168, loadDemandKWh: 95 },
  { month: "jun", label: "Jun", solarProductionKWh: 184, loadDemandKWh: 92 },
  { month: "jul", label: "Jul", solarProductionKWh: 178, loadDemandKWh: 95 },
  { month: "aug", label: "Aug", solarProductionKWh: 148, loadDemandKWh: 95 },
  { month: "sep", label: "Sep", solarProductionKWh: 112, loadDemandKWh: 92 },
  { month: "okt", label: "Okt", solarProductionKWh: 64, loadDemandKWh: 95 },
  { month: "nov", label: "Nov", solarProductionKWh: 26, loadDemandKWh: 92 },
  { month: "des", label: "Des", solarProductionKWh: 11, loadDemandKWh: 95 }
];

const annualSolar = monthlyEnergyBalance.reduce((s, r) => s + r.solarProductionKWh, 0);
const annualLoad = monthlyEnergyBalance.reduce((s, r) => s + r.loadDemandKWh, 0);

const annualTotals = {
  totalWhPerDay: annualLoad * 1000 / 365,
  totalAhPerDay: 0,
  totalWhPerWeek: annualLoad * 1000 / 52,
  totalAhPerWeek: 0,
  annualSolarProductionKWh: annualSolar,
  annualLoadDemandKWh: annualLoad,
  annualEnergyBalanceKWh: annualSolar - annualLoad,
  annualSecondaryRuntimeHours: 372,
  annualFuelConsumption: 165,
  annualFuelCost: 7904
};

const derivedResults = {
  equipmentBudgetRows: [],
  totalWhPerDay: annualTotals.totalWhPerDay,
  totalAhPerDay: 0,
  totalWhPerWeek: annualTotals.totalWhPerWeek,
  totalAhPerWeek: 0,
  monthlyEnergyBalance,
  annualTotals,
  systemRecommendation: {
    releaseArrangement: "Rør i frostfritt rom",
    primaryMeasurement: "Magnetisk induktiv (MID)",
    controlMeasurement: "Manuell flygelmåling, åpent profil",
    measurementEquipment: "MID-måler DN80, kontrollprofil nedstrøms",
    communication: "4G + NB-IoT fallback",
    loggerSetup: "2 × Campbell CR300",
    energyMonitoring: "Solcelle + batteri overvåking",
    secondarySource: "FuelCell",
    secondarySourcePowerW: 425,
    batteryCapacityAh: 600,
    batteryAutonomyDays: 5,
    icingAdaptation: "Frostfritt rom + varmekabel",
    operationsRequirements: ["Halvårlig inspeksjon", "Logging og kalibrering hvert år"]
  },
  costComparison: {
    annualEnergyDeficitKWh: 0,
    alternatives: [
      {
        source: "FuelCell",
        purchaseCost: 158000,
        operatingCostPerYear: 10704,
        annualMaintenance: 2800,
        evaluationHorizonYears: 15,
        technicalLifetimeHours: 20000,
        totalRuntimeHours: 982,
        replacementCount: 0,
        annualFuelConsumption: 165,
        annualCo2: 412,
        totalOwnershipCost: 318400
      },
      {
        source: "DieselGenerator",
        purchaseCost: 94000,
        operatingCostPerYear: 23980,
        annualMaintenance: 9600,
        evaluationHorizonYears: 15,
        technicalLifetimeHours: 8000,
        totalRuntimeHours: 1020,
        replacementCount: 1,
        annualFuelConsumption: 720,
        annualCo2: 1940,
        totalOwnershipCost: 516200
      }
    ]
  },
  reserveScenarios: { fuelCell: null, diesel: null }
};

const recommendation = {
  mainSolution: "Rørslipp i frostfritt rom med digital primærmåling",
  controlMeasurementMethod: "Manuell flygelmåling",
  justification: [
    "Slippordningen følger av lav variasjon og stabil måleprofil. Med sesongkrav på 19 L/s og naturlig stabilt tverrsnitt nedstrøms er rørslipp gjennom frostfritt rom det enkleste og mest verifiserbare valget.",
    "Magnetisk induktiv måling på primær, manuell kontroll på sekundær. MID-måling leverer ±0,5 % usikkerhet uten mekaniske bevegelige deler. Manuell flygelmåling i åpent profil gir uavhengig kontroll og oppfyller forskriftskravet om to målemetoder.",
    "Brenselcelle valgt over diesel på TOC, CO₂ og lyd. Over 15 år er brenselcelle 38 % billigere og slipper ut 79 % mindre CO₂ enn dieselaggregat ved samme energimengde. Lydnivået oppfyller konsesjonskravet ≤ 45 dBA på 10 m uten ekstra demping."
  ],
  additionalRequirements: [],
  status: "Recommended"
};

const html = reportModule.openReportWindow.toString
  ? // openReportWindow opens a window; we call buildReportHtml indirectly
    null
  : null;

// We need buildReportHtml directly. It's not exported, so import via dynamic
// import after re-exporting? Cheapest path: re-export. We avoid editing report.ts
// — instead, use openReportWindow's behavior: it calls window.open. In Node we
// stub window so it falls through to the blob branch, which we don't want.
// Simpler: temporarily monkey-patch globalThis to capture the HTML.

let captured = null;
globalThis.window = {
  open() {
    return {
      document: {
        open() {},
        write(s) { captured = s; },
        close() {}
      }
    };
  }
};
globalThis.document = { createElement: () => ({}), body: { appendChild() {}, removeChild() {} } };
globalThis.URL = { createObjectURL: () => "blob:fake", revokeObjectURL() {} };
globalThis.Blob = class { constructor() {} };

reportModule.openReportWindow(
  config,
  recommendation,
  null,
  derivedResults,
  "FuelCell",
  annualTotals,
  monthlyEnergyBalance
);

if (!captured) {
  console.error("No HTML captured.");
  process.exit(1);
}

writeFileSync(outPath, captured, "utf8");
console.log(`Wrote ${outPath} (${captured.length} bytes)`);
