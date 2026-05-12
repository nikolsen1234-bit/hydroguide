// Standalone preview: builds a sample report HTML and writes it to disk.
// Usage: node scripts/preview-report.mjs [output-path]
//
// Loads the TS source via tsx; runs buildReportHtml with mock data that mirrors
// the shape produced by AnalysisPage at runtime, then writes the resulting HTML
// to the given path (default: ../../Music/HydroGuide-report-preview.html).

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv[2];
const outPath = outArg
  ? resolve(outArg)
  : resolve(__dirname, "..", "..", "..", "..", "Music", "HydroGuide-report-preview.html");

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  plugins: [
    {
      name: "preview-strip-node-shebang",
      enforce: "pre",
      transform(code, id) {
        return id.endsWith("backend/scripts/check-trace-id.mjs") ? code.replace(/^#!.*\r?\n/, "") : null;
      }
    }
  ],
  server: { middlewareMode: true }
});
const reportModule = await vite.ssrLoadModule("/src/utils/report.ts");

const config = {
  id: "cfg-markani-2034",
  engineMode: "hydroguide",
  name: "Markåni kraftverk",
  location: "Markåni kraftverk (Vaksdal)",
  locationPlaceId: "2034",
  locationLat: 60.6154,
  locationLng: 5.80658,
  nvePlantDetails: {
    name: "Markåni kraftverk",
    stationId: "2034",
    owner: "",
    municipality: "Vaksdal",
    county: "Vestland",
    maxOutputMW: null,
    productionGWh: null,
    grossHeadM: null,
    commissionedYear: "",
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
    q01ConcessionRequirement: "yes",
    q02ProjectType: "new",
    q03FlowClass: "0_50",
    q04RequirementPattern: "inflowControlled",
    q05PassAllInflowWhenLow: "yes",
    q06CanChangeRelease: "yes",
    q07ReleaseSolution: "pipeIntake",
    q08FishMigration: "no",
    q09CoandaExists: "no",
    q10SiteChallenges: ["freezing", "difficultAccess"],
    q11PowerCommunication: ["solarBattery", "mobileCoverage"],
    q12PublicDisplay: ["sign"],
    q13AfterIntakeRack: "yes",
    q14DryFrostFreePlacement: "protectedSump",
    q15ReturnNearDam: "yes",
    q16PipeCapacityLowWater: "yes",
    q17PipeFull: "yes",
    q18PipeAirFree: "yes",
    q19StraightRunCalmFlow: "yes",
    q20ValveDownstream: "yes",
    q21ServiceValveBefore: "yes",
    q22PipeGeometryType: "fullPressurePipe",
    q23ConductivityForMagmeter: "yes",
    q24UltrasonicMountPossible: "yes",
    q25AdpGeometryKnown: "yes",
    q26AirEntrainedAtMeasurement: "no",
    q27RegulationFrequency: "continuousAutomatic",
    q65HourlyAutomaticLogging: "yes",
    q66AccuracyWithinFivePercent: "yes",
    q67CompletenessNinetySevenPercent: "yes",
    q68SecureDataStorageForNve: "yes",
    q69AlternativeMethod: "no",
    q1FacilityType: "new",
    q2HighestRequiredMinFlow: 15,
    q3ReleaseRequirementVariation: "inflowControlled",
    q4ReleaseMethod: "pipe",
    q5IsSedimentClogging: "no",
    q6FishPassage: "no",
    q7BypassOnOutage: "yes",
    q8MeasurementProfile: "stable",
    q9PublicControl: "yes"
  },
  systemParameters: {
    "4gCoverage": true,
    nbIotCoverage: true,
    lineOfSightUnder15km: true,
    inspectionsPerYear: 3,
    hasBackupSource: true,
    batteryMode: "ah",
    batteryValue: 600
  },
  solar: { panelPowerWp: 425, panelCount: 2, systemEfficiency: 0.8 },
  battery: { nominalVoltage: 12.8, maxDepthOfDischarge: 0.8 },
  fuelCell: {
    purchaseCost: 88000,
    annualMaintenance: 100,
    fuelCostPerLiter: 65,
    fuelConsumptionPerKWh: 0.9,
    co2PerLiter: 1.088,
    technicalLifetimeHours: 6500,
    powerW: 42,
    fuelPrice: 65,
    lifetime: 6500
  },
  diesel: {
    purchaseCost: 35000,
    annualMaintenance: 6500,
    fuelCostPerLiter: 30,
    fuelConsumptionPerKWh: 0.5,
    co2PerLiter: 2.68,
    technicalLifetimeHours: 43800,
    powerW: 3500,
    fuelPrice: 30,
    lifetime: 43800
  },
  other: { evaluationHorizonYears: 10, co2Methanol: 1.088, co2Diesel: 2.68 },
  monthlySolarRadiation: {
    jan: 0.11, feb: 1.02, mar: 21.44, apr: 61.44, mai: 79.35, jun: 79.3,
    jul: 80.63, aug: 71.42, sep: 37.71, okt: 3.06, nov: 0.26, des: 0.02
  },
  equipmentBudgetSettings: {},
  equipmentRows: [],
  radioLink: { frequencyMHz: 868.5, rainFactor: 25 },
  cachedRadioAnalysis: {
    terrainDistanceKm: 1.66,
    freeSpaceLossDb: 95.6,
    rainAttenuationDb: 0.1,
    fresnelClearanceM: 12.4
  },
  derivedResults: {},
  lastRecommendation: null
};

const monthlyEnergyBalance = [
  { month: "jan", label: "Jan", solarProductionKWh: 1, loadDemandKWh: 20 },
  { month: "feb", label: "Feb", solarProductionKWh: 1, loadDemandKWh: 18 },
  { month: "mar", label: "Mar", solarProductionKWh: 15, loadDemandKWh: 20 },
  { month: "apr", label: "Apr", solarProductionKWh: 42, loadDemandKWh: 19 },
  { month: "mai", label: "Mai", solarProductionKWh: 54, loadDemandKWh: 20 },
  { month: "jun", label: "Jun", solarProductionKWh: 54, loadDemandKWh: 19 },
  { month: "jul", label: "Jul", solarProductionKWh: 55, loadDemandKWh: 20 },
  { month: "aug", label: "Aug", solarProductionKWh: 49, loadDemandKWh: 20 },
  { month: "sep", label: "Sep", solarProductionKWh: 26, loadDemandKWh: 19 },
  { month: "okt", label: "Okt", solarProductionKWh: 2, loadDemandKWh: 20 },
  { month: "nov", label: "Nov", solarProductionKWh: 1, loadDemandKWh: 19 },
  { month: "des", label: "Des", solarProductionKWh: 0, loadDemandKWh: 20 }
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
  annualSecondaryRuntimeHours: 230,
  annualFuelConsumption: 48,
  annualFuelCost: 3120
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
    releaseArrangement: "R\u00f8r via inntak til frostfritt skap",
    primaryMeasurement: "Magnetisk induktiv (MID)",
    controlMeasurement: "Manuell flygelm\u00e5ling i \u00e5pent profil",
    measurementEquipment: "MID-m\u00e5ler DN80, kontrollprofil nedstr\u00f8ms",
    communication: "4G + NB-IoT fallback",
    loggerSetup: "2 \u00d7 Campbell CR300",
    energyMonitoring: "Solcelle og batterioverv\u00e5king",
    secondarySource: "FuelCell",
    secondarySourcePowerW: 42,
    batteryCapacityAh: 600,
    batteryAutonomyDays: 5,
    icingAdaptation: "Frostfritt rom + varmekabel",
    operationsRequirements: ["Tre inspeksjoner per \u00e5r", "\u00c5rlig kontroll av logger og m\u00e5leprofil"]
  },
  costComparison: {
    annualEnergyDeficitKWh: 0,
    alternatives: [
      {
        source: "FuelCell",
        purchaseCost: 88000,
        operatingCostPerYear: 3220,
        annualMaintenance: 100,
        evaluationHorizonYears: 10,
        technicalLifetimeHours: 6500,
        totalRuntimeHours: 2300,
        replacementCount: 0,
        annualFuelConsumption: 48,
        annualCo2: 52,
        totalOwnershipCost: 120200
      },
      {
        source: "DieselGenerator",
        purchaseCost: 35000,
        operatingCostPerYear: 9950,
        annualMaintenance: 6500,
        evaluationHorizonYears: 10,
        technicalLifetimeHours: 43800,
        totalRuntimeHours: 2300,
        replacementCount: 0,
        annualFuelConsumption: 115,
        annualCo2: 308,
        totalOwnershipCost: 134500
      }
    ]
  },
  reserveScenarios: { fuelCell: null, diesel: null }
};

const recommendation = {
  mainSolution: "R\u00f8rslipp via inntak med MID-m\u00e5ling og mobil kommunikasjon",
  controlMeasurementMethod: "Manuell flygelm\u00e5ling",
  justification: [
    "Mark\u00e5ni har registrert krav om 15 l/s minstevannf\u00f8ring ved hovedinntak. R\u00f8rslipp via inntak gir en lukket og kontrollerbar l\u00f8sning som kan plasseres t\u00f8rt og frostfritt.",
    "MID-m\u00e5ling anbefales som prim\u00e6rm\u00e5ling, med manuell flygelm\u00e5ling som uavhengig kontroll. L\u00f8sningen passer et lavt vannf\u00f8ringsomr\u00e5de og gir enkel dokumentasjon for drift og tilsyn.",
    "Solcelle og batteri dekker normal drift, mens brenselcelle gir stille reserve i perioder med lav solproduksjon. 4G med NB-IoT som fallback gir robust kommunikasjon for et avsidesliggende inntak."
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

await reportModule.openReportWindow(
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
await vite.close();
console.log(`Wrote ${outPath} (${captured.length} bytes)`);
