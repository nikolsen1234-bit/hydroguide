import { calculateNumericResults, normalizeCalculationRequest } from "../../backend/services/calculations/_calculationCore.js";

const referenceRequest = {
  systemParameters: {
    hasBackupSource: true,
    batteryMode: "ah",
    batteryValue: 500,
    inspectionsPerYear: 4,
    "4gCoverage": false,
    nbIotCoverage: false,
    lineOfSightUnder15km: false
  },
  solar: {
    panelPowerWp: 425,
    panelCount: 2,
    systemEfficiency: 0.8,
    lifetimeYears: 25,
    purchaseCost: 0
  },
  battery: {
    nominalVoltage: 12.8,
    maxDepthOfDischarge: 0.8,
    purchaseCost: 0
  },
  fuelCell: {
    purchaseCost: 88000,
    powerW: 82,
    fuelConsumptionPerKWh: 0.9,
    fuelPrice: 75,
    lifetime: 6500,
    annualMaintenance: 100
  },
  diesel: {
    purchaseCost: 35000,
    powerW: 6500,
    fuelConsumptionPerKWh: 0.5,
    fuelPrice: 18.1,
    lifetime: 43800,
    annualMaintenance: 25000
  },
  other: {
    co2Methanol: 1.088,
    co2Diesel: 2.68,
    evaluationHorizonYears: 10
  },
  monthlySolarRadiation: {
    jan: 0.11064530284,
    feb: 1.02081508839,
    mar: 21.44387486665,
    apr: 61.43870641884,
    mai: 79.35391031094,
    jun: 79.30232678362,
    jul: 80.63345578117,
    aug: 71.41789862748,
    sep: 37.71410191662,
    okt: 3.05505664524,
    nov: 0.25973765459,
    des: 0.01700974846
  },
  equipmentRows: [
    { id: "1", active: true, name: "Victron BMS", powerW: 0.1, runtimeHoursPerDay: 24 },
    { id: "2", active: true, name: "VICTRON Lynx Distributor", powerW: 2.4, runtimeHoursPerDay: 24 },
    { id: "3", active: true, name: "VICTRON Orion TR Omformer DC-DC 12>24V 10A", powerW: 1.2, runtimeHoursPerDay: 24 },
    { id: "4", active: true, name: "Victron Cerbo GX - MK2", powerW: 2.8, runtimeHoursPerDay: 24 },
    { id: "5", active: true, name: "VICTRON SmartSolar MPPT 250/100-TR VE.Can", powerW: 0.042, runtimeHoursPerDay: 24 },
    { id: "6", active: true, name: "Siemens FMS5020", powerW: 6.45, runtimeHoursPerDay: 24 },
    { id: "7", active: true, name: "Teltonika RUT956", powerW: 7, runtimeHoursPerDay: 24 },
    { id: "8", active: true, name: "Efoy Pro 1800", powerW: 0.5, runtimeHoursPerDay: 24 },
    { id: "9", active: true, name: "Efoy Fuel Manager FM4", powerW: 0.0374, runtimeHoursPerDay: 24 },
    { id: "10", active: true, name: "Datalogger", powerW: 7, runtimeHoursPerDay: 24 }
  ]
};

const expected = {
  totalWhPerDay: 660.71,
  totalAhPerDay: 51.62,
  batteryAh: 500,
  batteryAutonomyDays: 7.75,
  annualEnergyDeficitKWh: 102.63,
  dieselFuelLitersPerYear: 51.32,
  dieselFuelCostPerYear: 928.82,
  fuelCellToc: 237475.25,
  dieselToc: 294288.16
};

function assertClose(label, actual, expectedValue, tolerance = 0.02) {
  if (Math.abs(actual - expectedValue) > tolerance) {
    throw new Error(`${label} mismatch: expected ${expectedValue}, got ${actual}`);
  }
}

const calculations = calculateNumericResults(normalizeCalculationRequest(referenceRequest));
const fuelCell = calculations.costComparison.items.find((item) => item.source === "Brenselcelle");
const diesel = calculations.costComparison.items.find((item) => item.source === "Dieselaggregat");
const sharedInvestmentRegression = calculateNumericResults(
  normalizeCalculationRequest({
    ...referenceRequest,
    solar: {
      ...referenceRequest.solar,
      purchaseCost: 30000
    },
    battery: {
      ...referenceRequest.battery,
      purchaseCost: 65000
    }
  })
);
const sharedFuelCell = sharedInvestmentRegression.costComparison.items.find((item) => item.source === "Brenselcelle");
const sharedDiesel = sharedInvestmentRegression.costComparison.items.find((item) => item.source === "Dieselaggregat");
const replacementRegression = calculateNumericResults(
  normalizeCalculationRequest({
    ...referenceRequest,
    fuelCell: {
      ...referenceRequest.fuelCell,
      lifetime: 400
    },
    diesel: {
      ...referenceRequest.diesel,
      lifetime: 40
    }
  })
);
const replacementFuelCell = replacementRegression.costComparison.items.find((item) => item.source === "Brenselcelle");
const replacementDiesel = replacementRegression.costComparison.items.find((item) => item.source === "Dieselaggregat");

assertClose("totalWhPerDay", calculations.totals.totalWhPerDay, expected.totalWhPerDay);
assertClose("totalAhPerDay", calculations.totals.totalAhPerDay, expected.totalAhPerDay);
assertClose("battery.capacityAh", calculations.battery.capacityAh, expected.batteryAh);
assertClose("battery.autonomyDays", calculations.battery.autonomyDays, expected.batteryAutonomyDays);
assertClose("annualEnergyDeficitKWh", calculations.annualEnergyDeficitKWh, expected.annualEnergyDeficitKWh);
assertClose(
  "diesel annual fuel liters",
  calculations.scenarios.diesel.annualTotals.annualFuelConsumption,
  expected.dieselFuelLitersPerYear
);
assertClose(
  "diesel annual fuel cost",
  calculations.scenarios.diesel.annualTotals.annualFuelCost,
  expected.dieselFuelCostPerYear
);
assertClose("fuelCell TOC", fuelCell?.toc ?? Number.NaN, expected.fuelCellToc, 1.5);
assertClose("diesel TOC", diesel?.toc ?? Number.NaN, expected.dieselToc, 1.5);
assertClose("fuelCell TOC ignores shared system costs", sharedFuelCell?.toc ?? Number.NaN, expected.fuelCellToc, 1.5);
assertClose("diesel TOC ignores shared system costs", sharedDiesel?.toc ?? Number.NaN, expected.dieselToc, 1.5);

assertClose(
  "fuelCell TOC includes replacementCount",
  replacementFuelCell?.toc ?? Number.NaN,
  (replacementFuelCell?.purchaseCost ?? 0) +
    ((replacementFuelCell?.operatingCostPerYear ?? 0) + (replacementFuelCell?.annualMaintenance ?? 0)) *
      (replacementFuelCell?.evaluationHorizonYears ?? 0) +
    (replacementFuelCell?.replacementCount ?? 0) * (replacementFuelCell?.purchaseCost ?? 0),
  0.1
);
assertClose(
  "diesel TOC includes replacementCount",
  replacementDiesel?.toc ?? Number.NaN,
  (replacementDiesel?.purchaseCost ?? 0) +
    ((replacementDiesel?.operatingCostPerYear ?? 0) + (replacementDiesel?.annualMaintenance ?? 0)) *
      (replacementDiesel?.evaluationHorizonYears ?? 0) +
    (replacementDiesel?.replacementCount ?? 0) * (replacementDiesel?.purchaseCost ?? 0),
  0.1
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedAgainst: "Prosjektverktøy demo - solcelleverktøy (3).xlsx",
      results: {
        totalWhPerDay: calculations.totals.totalWhPerDay,
        totalAhPerDay: calculations.totals.totalAhPerDay,
        batteryAh: calculations.battery.capacityAh,
        batteryAutonomyDays: calculations.battery.autonomyDays,
        annualEnergyDeficitKWh: calculations.annualEnergyDeficitKWh,
        dieselFuelLitersPerYear: calculations.scenarios.diesel.annualTotals.annualFuelConsumption,
        dieselFuelCostPerYear: calculations.scenarios.diesel.annualTotals.annualFuelCost,
        fuelCellToc: fuelCell?.toc ?? null,
        dieselToc: diesel?.toc ?? null
      }
    },
    null,
    2
  )
);
