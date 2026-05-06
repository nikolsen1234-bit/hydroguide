import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeCalculationRequest,
  validateCalculationRequest
} from "./_calculationCore.js";

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
  it("does not require reserve-source fields when reserve source is disabled", () => {
    const configuration = normalizeCalculationRequest(basePayload);

    assert.deepEqual(validateCalculationRequest(configuration), {});
  });

  it("requires both reserve-source alternatives and economic inputs when reserve source is enabled", () => {
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
    assert.equal(errors["fuelCell.annualMaintenance"], "Årleg vedlikehald brenselcelle må fyllast ut.");
    assert.equal(errors["diesel.purchaseCost"], "Innkjøpskostnad diesel må fyllast ut.");
    assert.equal(errors["diesel.powerW"], "Effekt diesel må fyllast ut.");
    assert.equal(errors["diesel.fuelConsumptionPerKWh"], "Drivstofforbruk diesel må fyllast ut.");
    assert.equal(errors["diesel.fuelPrice"], "Drivstoffpris diesel må fyllast ut.");
    assert.equal(errors["diesel.lifetime"], "Levetid diesel må fyllast ut.");
    assert.equal(errors["diesel.annualMaintenance"], "Årleg vedlikehald diesel må fyllast ut.");
    assert.equal(errors["other.evaluationHorizonYears"], "Vurderingshorisont må fyllast ut.");
    assert.equal(errors["other.co2Methanol"], "CO2-faktor for brenselcelle må fyllast ut.");
    assert.equal(errors["other.co2Diesel"], "CO2-faktor for diesel må fyllast ut.");
  });
});
