import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateNumericResults,
  normalizeCalculationRequest,
  validateCalculationRequest
} from "./_calculationCore.js";

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

const monthlySolarRadiation = {
  jan: 1,
  feb: 1,
  mar: 1,
  apr: 1,
  mai: 1,
  jun: 1,
  jul: 1,
  aug: 1,
  sep: 1,
  okt: 1,
  nov: 1,
  des: 1
};

const frontendMonthlySolarRadiation = {
  jan: 1,
  feb: 1,
  mar: 1,
  apr: 1,
  may: 1,
  jun: 1,
  jul: 1,
  aug: 1,
  sep: 1,
  oct: 1,
  nov: 1,
  dec: 1
};

const basePayload = {
  solar: {
    panelPowerWp: 100,
    panelCount: 2,
    systemEfficiency: 0.8
  },
  battery: {
    batteryMode: "ah",
    batteryValue: 100,
    nominalVoltage: 24,
    maxDepthOfDischarge: 0.5
  },
  backupSource: {
    hasBackupSource: false
  },
  monthlySolarRadiation,
  equipmentRows: [
    {
      active: true,
      name: "Logger",
      powerW: 10,
      runtimeHoursPerDay: 24
    }
  ]
};

describe("validateCalculationRequest", () => {
  it("does not require secondary-source fields when secondary source is disabled", () => {
    const configuration = normalizeCalculationRequest(basePayload);

    assert.deepEqual(validateCalculationRequest(configuration), {});
  });

  it("requires both secondary-source alternatives and economic inputs when secondary source is enabled", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      backupSource: { hasBackupSource: true }
    });
    const errors = validateCalculationRequest(configuration);

    assert.equal(errors["fuelCell.purchaseCost"], "Innkjøpskostnad brenselcelle må fyllast ut.");
    assert.equal(errors["fuelCell.powerW"], "Effekt brenselcelle må fyllast ut.");
    assert.equal(errors["fuelCell.fuelConsumptionPerKWh"], "Drivstofforbruk brenselcelle må fyllast ut.");
    assert.equal(errors["fuelCell.fuelPrice"], "Drivstoffpris brenselcelle må fyllast ut.");
    assert.equal(errors["fuelCell.lifetime"], "Levetid brenselcelle må fyllast ut.");
    assert.equal(errors["fuelCell.annualMaintenance"], undefined);
    assert.equal(errors["diesel.purchaseCost"], "Innkjøpskostnad diesel må fyllast ut.");
    assert.equal(errors["diesel.powerW"], "Effekt diesel må fyllast ut.");
    assert.equal(errors["diesel.fuelConsumptionPerKWh"], "Drivstofforbruk diesel må fyllast ut.");
    assert.equal(errors["diesel.fuelPrice"], "Drivstoffpris diesel må fyllast ut.");
    assert.equal(errors["diesel.lifetime"], "Levetid diesel må fyllast ut.");
    assert.equal(errors["diesel.annualMaintenance"], undefined);
    assert.equal(errors["other.evaluationHorizonYears"], "Vurderingshorisont må fyllast ut.");
    assert.equal(errors["other.co2Methanol"], "CO2-faktor for brenselcelle må fyllast ut.");
    assert.equal(errors["other.co2Diesel"], "CO2-faktor for diesel må fyllast ut.");
  });

  it("requires only the preferred secondary source when one is selected", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 1000,
        powerW: 1000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        evaluationHorizonYears: 10
      }
    });

    assert.deepEqual(validateCalculationRequest(configuration), {});
  });

  it("requires every secondary source included in the comparison", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      secondary_sources: ["fuelCell", "diesel"],
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 1000,
        powerW: 1000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        evaluationHorizonYears: 10
      }
    });
    const errors = validateCalculationRequest(configuration);

    assert.equal(errors["fuelCell.purchaseCost"], undefined);
    assert.equal(errors["diesel.purchaseCost"], "Innkjøpskostnad diesel må fyllast ut.");
    assert.equal(errors["other.co2Diesel"], "CO2-faktor for diesel må fyllast ut.");
  });

  it("accepts frontend export field names for system parameters and month keys", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      systemparametere: undefined,
      systemParameters: {
        hasBackupSource: false,
        batteryMode: "ah",
        batteryValue: 100
      },
      monthlySolarRadiation: frontendMonthlySolarRadiation
    });

    assert.equal(configuration.backupSource.hasBackupSource, false);
    assert.equal(configuration.battery.batteryMode, "ah");
    assert.equal(configuration.battery.batteryValue, 100);
    assert.equal(configuration.monthlySolarRadiation.mai, 1);
    assert.equal(configuration.monthlySolarRadiation.okt, 1);
    assert.equal(configuration.monthlySolarRadiation.des, 1);
    assert.deepEqual(validateCalculationRequest(configuration), {});
  });
});

describe("normalizeCalculationRequest", () => {
  it("keeps component lifetime in hours", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      equipmentRows: [
        {
          active: true,
          name: "New component",
          powerW: 5,
          runtimeHoursPerDay: 12,
          purchaseCost: 1200,
          lifetimeHours: 20000,
          annualMaintenance: 100,
          supplier: "Vendor",
          comment: "Main logger"
        }
      ]
    });

    assert.equal(configuration.equipmentRows[0].lifetimeHours, 20000);
    assert.equal(configuration.equipmentRows[0].purchaseCost, 1200);
    assert.equal("annualMaintenance" in configuration.equipmentRows[0], false);
    assert.equal(configuration.equipmentRows[0].supplier, "Vendor");
    assert.equal(configuration.equipmentRows[0].comment, "Main logger");
  });
});

describe("calculateNumericResults", () => {
  it("includes fractional replacement cost when secondary runtime exceeds lifetime", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 1000,
        powerW: 100000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 100,
        annualMaintenance: 0
      },
      diesel: {
        purchaseCost: 1000,
        powerW: 100000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 100,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        co2Diesel: 0,
        evaluationHorizonYears: 10
      },
      monthlySolarRadiation: {
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        mai: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        okt: 0,
        nov: 0,
        des: 0
      },
      equipmentRows: [
        {
          active: true,
          name: "Load",
          powerW: 1000,
          runtimeHoursPerDay: 24
        }
      ]
    });

    const results = calculateNumericResults(configuration);
    const fuelCell = results.costComparison.alternatives.find((item) => item.source === "Brenselcelle");

    assert.equal(fuelCell.replacementCount, 7.76);
    assert.equal(fuelCell.toc, 8760);
  });

  it("selects the cheapest secondary source by default", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 100000,
        powerW: 1000,
        fuelConsumptionPerKWh: 10,
        fuelPrice: 100,
        lifetime: 10000,
        annualMaintenance: 10000
      },
      diesel: {
        purchaseCost: 1000,
        powerW: 1000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        co2Diesel: 0,
        evaluationHorizonYears: 10
      },
      monthlySolarRadiation: {
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        mai: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        okt: 0,
        nov: 0,
        des: 0
      }
    });

    const results = calculateNumericResults(configuration);

    assert.equal(results.selectedSource, "Dieselaggregat");
    assert.equal(results.annualTotals.annualFuelCost, 0);
  });

  it("uses the preferred secondary source when provided", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 100000,
        powerW: 1000,
        fuelConsumptionPerKWh: 10,
        fuelPrice: 100,
        lifetime: 10000,
        annualMaintenance: 10000
      },
      diesel: {
        purchaseCost: 1000,
        powerW: 1000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        co2Diesel: 0,
        evaluationHorizonYears: 10
      },
      monthlySolarRadiation: {
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        mai: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        okt: 0,
        nov: 0,
        des: 0
      }
    });

    const results = calculateNumericResults(configuration);

    assert.equal(results.selectedSource, "Brenselcelle");
    assert.deepEqual(results.costComparison.alternatives.map((item) => item.source), ["Brenselcelle"]);
  });

  it("keeps both secondary alternatives in the cost comparison when requested", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      secondary_sources: ["fuelCell", "diesel"],
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 100000,
        powerW: 1000,
        fuelConsumptionPerKWh: 10,
        fuelPrice: 100,
        lifetime: 10000,
        annualMaintenance: 10000
      },
      diesel: {
        purchaseCost: 1000,
        powerW: 1000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        co2Diesel: 0,
        evaluationHorizonYears: 10
      },
      monthlySolarRadiation: {
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        mai: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        okt: 0,
        nov: 0,
        des: 0
      }
    });

    const results = calculateNumericResults(configuration);

    assert.equal(results.selectedSource, "Brenselcelle");
    assert.deepEqual(results.costComparison.alternatives.map((item) => item.source), ["Brenselcelle", "Dieselaggregat"]);
  });

  it("ignores legacy annual maintenance inputs in secondary source costs", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      secondary_sources: ["fuelCell", "diesel"],
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 1000,
        powerW: 100000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 999999
      },
      diesel: {
        purchaseCost: 2000,
        powerW: 100000,
        fuelConsumptionPerKWh: 0,
        fuelPrice: 0,
        lifetime: 10000,
        annualMaintenance: 999999
      },
      other: {
        co2Methanol: 0,
        co2Diesel: 0,
        evaluationHorizonYears: 10
      },
      monthlySolarRadiation: {
        jan: 0,
        feb: 0,
        mar: 0,
        apr: 0,
        mai: 0,
        jun: 0,
        jul: 0,
        aug: 0,
        sep: 0,
        okt: 0,
        nov: 0,
        des: 0
      }
    });

    const results = calculateNumericResults(configuration);
    const fuelCell = results.costComparison.alternatives.find((item) => item.source === "Brenselcelle");
    const diesel = results.costComparison.alternatives.find((item) => item.source === "Dieselaggregat");

    assert.equal("annualMaintenance" in fuelCell, false);
    assert.equal("annualMaintenance" in diesel, false);
    assert.equal(fuelCell.toc, 1000);
    assert.equal(diesel.toc, 2000);
  });

  it("uses the unrounded annual deficit for secondary-source costs", () => {
    const configuration = normalizeCalculationRequest({
      ...basePayload,
      preferred_secondary_source: "fuelCell",
      backupSource: { hasBackupSource: true },
      fuelCell: {
        purchaseCost: 0,
        powerW: 42,
        fuelConsumptionPerKWh: 0.75,
        fuelPrice: 65,
        lifetime: 6500,
        annualMaintenance: 0
      },
      other: {
        co2Methanol: 0,
        evaluationHorizonYears: 1
      },
      solar: {
        panelPowerWp: 420,
        panelCount: 2,
        systemEfficiency: 0.77
      },
      monthlySolarRadiation: {
        jan: 10,
        feb: 20,
        mar: 30,
        apr: 40,
        mai: 50,
        jun: 60,
        jul: 70,
        aug: 80,
        sep: 90,
        okt: 100,
        nov: 110,
        des: 120
      },
      equipmentRows: [
        {
          active: true,
          name: "Logger",
          powerW: 10,
          runtimeHoursPerDay: 24
        },
        {
          active: true,
          name: "Router",
          powerW: 8,
          runtimeHoursPerDay: 12
        }
      ]
    });

    const results = calculateNumericResults(configuration);
    const fuelCell = results.costComparison.alternatives.find((item) => item.source === "Brenselcelle");

    assertClose(results.annualEnergyDeficitKWh, 3.948);
    assertClose(results.annualTotals.annualFuelCost, 192.465);
    assertClose(fuelCell.operatingCostPerYear, 192.465);
  });
});
