const MAX_CONFIGURATION_EQUIPMENT_ROWS = 200;
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const MONTH_LABELS = {
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
const DAYS_IN_MONTH = {
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
const BUDGET_MONTH_DAYS = 30;

const QUESTION_ALLOWED_VALUES = {
  "backupSource.hasBackupSource": [true, false],
  "battery.batteryMode": ["ah", "autonomyDays"]
};

function makeId(prefix = "cfg") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundDown(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.floor(value * factor) / factor;
}

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRuntimeHoursPerDay(value) {
  return Math.max(0, toNumber(value));
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  return "";
}

function normalizeBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizeSolar(value = {}) {
  return {
    panelPowerWp: normalizeNumber(value.panelPowerWp),
    panelCount: normalizeNumber(value.panelCount),
    systemEfficiency: normalizeNumber(value.systemEfficiency)
  };
}

function normalizeBattery(value = {}) {
  return {
    batteryMode: value.batteryMode === "ah" || value.batteryMode === "autonomyDays" ? value.batteryMode : "",
    batteryValue: normalizeNumber(value.batteryValue),
    nominalVoltage: normalizeNumber(value.nominalVoltage),
    maxDepthOfDischarge: normalizeNumber(value.maxDepthOfDischarge)
  };
}

function normalizeBackupSourceOption(value = {}) {
  return {
    purchaseCost: normalizeNumber(value.purchaseCost),
    powerW: normalizeNumber(value.powerW),
    fuelConsumptionPerKWh: normalizeNumber(value.fuelConsumptionPerKWh),
    fuelPrice: normalizeNumber(value.fuelPrice),
    lifetime: normalizeNumber(value.lifetime),
    annualMaintenance: normalizeNumber(value.annualMaintenance)
  };
}

function normalizeBackupSource(value = {}) {
  return {
    hasBackupSource: normalizeBoolean(value.hasBackupSource),
    fuelCell: normalizeBackupSourceOption(value.fuelCell),
    diesel: normalizeBackupSourceOption(value.diesel)
  };
}

function normalizeOther(value = {}) {
  return {
    co2Methanol: normalizeNumber(value.co2Methanol),
    co2Diesel: normalizeNumber(value.co2Diesel),
    evaluationHorizonYears: normalizeNumber(value.evaluationHorizonYears)
  };
}

function normalizeMonthlySolarRadiation(value = {}) {
  return {
    jan: normalizeNumber(value.jan),
    feb: normalizeNumber(value.feb),
    mar: normalizeNumber(value.mar),
    apr: normalizeNumber(value.apr),
    mai: normalizeNumber(value.mai),
    jun: normalizeNumber(value.jun),
    jul: normalizeNumber(value.jul),
    aug: normalizeNumber(value.aug),
    sep: normalizeNumber(value.sep),
    okt: normalizeNumber(value.okt),
    nov: normalizeNumber(value.nov),
    des: normalizeNumber(value.des)
  };
}

function normalizeEquipmentBudgetSettings(value = {}) {
  return {
    displayUnit: value.displayUnit === "ah" ? "ah" : "wh"
  };
}

function normalizeEquipmentRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.slice(0, MAX_CONFIGURATION_EQUIPMENT_ROWS).map((row) => {
    const maybeRow = row && typeof row === "object" ? row : {};
    return {
      id: typeof maybeRow.id === "string" && maybeRow.id.trim() ? maybeRow.id : makeId("eq"),
      active: typeof maybeRow.active === "boolean" ? maybeRow.active : true,
      name: typeof maybeRow.name === "string" ? maybeRow.name : "",
      powerW: normalizeNumber(maybeRow.powerW),
      runtimeHoursPerDay: normalizeNumber(maybeRow.runtimeHoursPerDay)
    };
  });
}

function mapImportedPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const legacyParams = raw.systemparametere ?? raw.systemParameters ?? {};
  const sourceBattery = raw.batteri ?? raw.battery ?? {};
  const sourceBackupSource = raw.backupSource ?? {};
  const importedEquipmentRows = Array.isArray(raw.utstyr)
    ? raw.utstyr.map((row) => ({
        id: makeId("eq"),
        active: row?.aktiv !== false,
        name: row?.namn ?? "",
        powerW: row?.effektW,
        runtimeHoursPerDay: row?.timarPerDag
      }))
    : undefined;

  return {
    solar: raw.sol ?? raw.solar,
    battery: {
      ...sourceBattery,
      batteryMode: sourceBattery.batteryMode ?? legacyParams.batteryMode,
      batteryValue: sourceBattery.batteryValue ?? legacyParams.batteryValue
    },
    backupSource: {
      hasBackupSource: sourceBackupSource.hasBackupSource ?? legacyParams.hasBackupSource,
      fuelCell: sourceBackupSource.fuelCell ?? raw.brenselcelle ?? raw.fuelCell,
      diesel: sourceBackupSource.diesel ?? raw.diesel
    },
    other: raw.andre ?? raw.other,
    monthlySolarRadiation: raw.solinnstraling ?? raw.monthlySolarRadiation,
    equipmentBudgetSettings: raw.effektbudsjett ?? raw.equipmentBudgetSettings,
    equipmentRows: importedEquipmentRows ?? raw.equipmentRows
  };
}

export function normalizeCalculationRequest(raw) {
  const payload =
    raw?.configuration && typeof raw.configuration === "object" && !Array.isArray(raw.configuration)
      ? raw.configuration
      : raw;
  const source = mapImportedPayload(payload);

  return {
    solar: normalizeSolar(source.solar),
    battery: normalizeBattery(source.battery),
    backupSource: normalizeBackupSource(source.backupSource),
    fuelCell: normalizeBackupSourceOption(source.backupSource.fuelCell),
    diesel: normalizeBackupSourceOption(source.backupSource.diesel),
    other: normalizeOther(source.other),
    monthlySolarRadiation: normalizeMonthlySolarRadiation(source.monthlySolarRadiation),
    equipmentBudgetSettings: normalizeEquipmentBudgetSettings(source.equipmentBudgetSettings),
    equipmentRows: normalizeEquipmentRows(source.equipmentRows),
    _backupSource: typeof raw?.preferred_backup === "string" ? raw.preferred_backup : ""
  };
}

function isEmptyNumber(value) {
  return value === "" || value === null || value === undefined;
}

function validateRequiredNumber(errors, key, value, label, options = {}) {
  if (isEmptyNumber(value)) {
    errors[key] = `${label} må fyllast ut.`;
    return;
  }

  const numericValue = Number(value);
  const min = options.min ?? 0;
  const allowZero = options.allowZero ?? false;

  if (Number.isNaN(numericValue)) {
    errors[key] = `${label} må vere eit gyldig tal.`;
    return;
  }

  if (allowZero ? numericValue < min : numericValue <= min) {
    errors[key] = `${label} må vere ${allowZero ? "lik eller større enn" : "større enn"} ${min}.`;
    return;
  }

  if (options.max !== undefined && numericValue > options.max) {
    errors[key] = `${label} må vere mindre enn eller lik ${options.max}.`;
  }
}

export function validateCalculationRequest(configuration) {
  const errors = {};

  if (configuration.backupSource.hasBackupSource === null) {
    errors["backupSource.hasBackupSource"] = "Det må avklarast om systemet har reservekjelde.";
  }

  if (!configuration.battery.batteryMode) {
    errors["battery.batteryMode"] = "Batterimodus må veljast.";
  }

  validateRequiredNumber(
    errors,
    "battery.batteryValue",
    configuration.battery.batteryValue,
    "Batteriverdi"
  );

  validateRequiredNumber(errors, "solar.panelPowerWp", configuration.solar.panelPowerWp, "Paneleffekt");
  validateRequiredNumber(errors, "solar.panelCount", configuration.solar.panelCount, "Tal panel");
  validateRequiredNumber(errors, "solar.systemEfficiency", configuration.solar.systemEfficiency, "Systemverknadsgrad", {
    min: 0,
    max: 1
  });
  validateRequiredNumber(errors, "battery.nominalVoltage", configuration.battery.nominalVoltage, "Nominell spenning");
  validateRequiredNumber(
    errors,
    "battery.maxDepthOfDischarge",
    configuration.battery.maxDepthOfDischarge,
    "Maks utladingsdjupn",
    { min: 0, max: 1 }
  );

  if (configuration.backupSource.hasBackupSource === true) {    validateRequiredNumber(errors, "fuelCell.purchaseCost", configuration.fuelCell.purchaseCost, "Innkjøpskostnad brenselcelle", {
      min: 0,
      allowZero: true
    });
    validateRequiredNumber(errors, "fuelCell.powerW", configuration.fuelCell.powerW, "Effekt brenselcelle");
    validateRequiredNumber(
      errors,
      "fuelCell.fuelConsumptionPerKWh",
      configuration.fuelCell.fuelConsumptionPerKWh,
      "Drivstofforbruk brenselcelle",
      { min: 0, allowZero: true }
    );
    validateRequiredNumber(errors, "fuelCell.fuelPrice", configuration.fuelCell.fuelPrice, "Drivstoffpris brenselcelle", {
      min: 0,
      allowZero: true
    });
    validateRequiredNumber(errors, "fuelCell.lifetime", configuration.fuelCell.lifetime, "Levetid brenselcelle");
    validateRequiredNumber(
      errors,
      "fuelCell.annualMaintenance",
      configuration.fuelCell.annualMaintenance,
      "Årleg vedlikehald brenselcelle",
      { min: 0, allowZero: true }
    );

    validateRequiredNumber(errors, "diesel.purchaseCost", configuration.diesel.purchaseCost, "Innkjøpskostnad diesel", {
      min: 0,
      allowZero: true
    });
    validateRequiredNumber(errors, "diesel.powerW", configuration.diesel.powerW, "Effekt diesel");
    validateRequiredNumber(
      errors,
      "diesel.fuelConsumptionPerKWh",
      configuration.diesel.fuelConsumptionPerKWh,
      "Drivstofforbruk diesel",
      { min: 0, allowZero: true }
    );
    validateRequiredNumber(errors, "diesel.fuelPrice", configuration.diesel.fuelPrice, "Drivstoffpris diesel", {
      min: 0,
      allowZero: true
    });
    validateRequiredNumber(errors, "diesel.lifetime", configuration.diesel.lifetime, "Levetid diesel");
    validateRequiredNumber(
      errors,
      "diesel.annualMaintenance",
      configuration.diesel.annualMaintenance,
      "Årleg vedlikehald diesel",
      { min: 0, allowZero: true }
    );    validateRequiredNumber(
      errors,
      "other.evaluationHorizonYears",
      configuration.other.evaluationHorizonYears,
      "Vurderingshorisont"
    );
    validateRequiredNumber(
      errors,
      "other.co2Methanol",
      configuration.other.co2Methanol,
      "CO2-faktor for brenselcelle",
      { min: 0, allowZero: true }
    );
    validateRequiredNumber(
      errors,
      "other.co2Diesel",
      configuration.other.co2Diesel,
      "CO2-faktor for diesel",
      { min: 0, allowZero: true }
    );
  }

  for (const month of MONTH_KEYS) {
    validateRequiredNumber(
      errors,
      `monthlySolarRadiation.${month}`,
      configuration.monthlySolarRadiation[month],
      `Solinnstråling ${month.toUpperCase()}`,
      { min: 0, allowZero: true }
    );
  }

  configuration.equipmentRows.forEach((row) => {
    if ((row.active || row.powerW !== "") && !row.name.trim()) {
      errors[`equipmentRows.${row.id}.name`] = "Utstyrsrada må ha namn.";
    }

    if (row.active && row.powerW === "") {
      errors[`equipmentRows.${row.id}.powerW`] = "Aktiv rad må ha effekt.";
    }

    if (row.powerW !== "" && Number(row.powerW) < 0) {
      errors[`equipmentRows.${row.id}.powerW`] = "Effekt kan ikkje vere negativ.";
    }

    if (row.active && row.runtimeHoursPerDay === "") {
      errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = "Aktiv rad må ha timar per døgn.";
    }

    if (row.runtimeHoursPerDay !== "" && Number(row.runtimeHoursPerDay) < 0) {
      errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = "Timar per døgn kan ikkje vere negativ.";
    }

    if (row.active && row.runtimeHoursPerDay !== "" && Number(row.runtimeHoursPerDay) === 0) {
      errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = "Timar per døgn må vere større enn 0.";
    }

    if (row.runtimeHoursPerDay !== "" && Number(row.runtimeHoursPerDay) > 24) {
      errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = "Timar per døgn kan ikkje vere større enn 24.";
    }
  });

  return errors;
}

function calculateEquipmentBudgetRows(equipmentRows, nominalVoltageValue) {
  const nominalVoltage = toNumber(nominalVoltageValue);

  return equipmentRows.map((row) => {
    const powerW = toNumber(row.powerW);
    const currentA = nominalVoltage > 0 ? powerW / nominalVoltage : 0;
    const runtimeHoursPerDay = row.active ? normalizeRuntimeHoursPerDay(row.runtimeHoursPerDay) : 0;
    const whPerDay = row.active ? powerW * runtimeHoursPerDay : 0;
    const ahPerDay = row.active ? currentA * runtimeHoursPerDay : 0;

    return {
      id: row.id,
      active: row.active,
      name: row.name,
      powerW: round(powerW, 2),
      currentA: round(currentA, 3),
      runtimeHoursPerDay: round(runtimeHoursPerDay, 2),
      whPerDay: round(whPerDay, 2),
      ahPerDay: round(ahPerDay, 2),
      whPerMonth: round(whPerDay * BUDGET_MONTH_DAYS, 2),
      ahPerMonth: round(ahPerDay * BUDGET_MONTH_DAYS, 2),
      whPerWeek: round(whPerDay * 7, 2),
      ahPerWeek: round(ahPerDay * 7, 2)
    };
  });
}

function calculateBatteryCapacityAh(configuration, totalWhPerDay) {
  const { batteryMode, batteryValue } = configuration.battery;
  const nominalVoltage = toNumber(configuration.battery.nominalVoltage);
  const maxDepthOfDischarge = toNumber(configuration.battery.maxDepthOfDischarge);

  if (batteryMode === "ah") {
    return round(toNumber(batteryValue), 2);
  }

  if (batteryMode === "autonomyDays" && nominalVoltage > 0 && maxDepthOfDischarge > 0) {
    return round((totalWhPerDay * toNumber(batteryValue)) / (nominalVoltage * maxDepthOfDischarge), 0);
  }

  return 0;
}

function calculateBatteryAutonomyDays(configuration, totalWhPerDay, batteryCapacityAh) {
  const nominalVoltage = toNumber(configuration.battery.nominalVoltage);
  const maxDepthOfDischarge = toNumber(configuration.battery.maxDepthOfDischarge);

  if (totalWhPerDay <= 0 || nominalVoltage <= 0 || maxDepthOfDischarge <= 0 || batteryCapacityAh <= 0) {
    return 0;
  }

  return round((batteryCapacityAh * nominalVoltage * maxDepthOfDischarge) / totalWhPerDay, 2);
}

function createAnnualTotals(monthlyEnergyBalance, totalWhPerDay, totalAhPerDay) {
  return {
    totalWhPerDay,
    totalAhPerDay,
    totalWhPerWeek: round(totalWhPerDay * 7, 2),
    totalAhPerWeek: round(totalAhPerDay * 7, 2),
    annualSolarProductionKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.solarProductionKWh, 0), 2),
    annualLoadDemandKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.loadDemandKWh, 0), 2),
    annualEnergyBalanceKWh: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.energyBalanceKWh, 0), 2),
    annualSecondaryRuntimeHours: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.secondaryRuntimeHours, 0), 2),
    annualFuelConsumption: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.fuelLiters, 0), 2),
    annualFuelCost: round(monthlyEnergyBalance.reduce((sum, row) => sum + row.fuelCost, 0), 2)
  };
}

function createEmptyAnnualTotals(totalWhPerDay, totalAhPerDay) {
  return {
    totalWhPerDay,
    totalAhPerDay,
    totalWhPerWeek: round(totalWhPerDay * 7, 2),
    totalAhPerWeek: round(totalAhPerDay * 7, 2),
    annualSolarProductionKWh: 0,
    annualLoadDemandKWh: 0,
    annualEnergyBalanceKWh: 0,
    annualSecondaryRuntimeHours: 0,
    annualFuelConsumption: 0,
    annualFuelCost: 0
  };
}

function selectedSourceConfig(configuration, source) {
  if (source === "Brenselcelle") {
    return configuration.fuelCell;
  }

  if (source === "Dieselaggregat") {
    return configuration.diesel;
  }

  return {
    purchaseCost: "",
    powerW: "",
    fuelConsumptionPerKWh: "",
    fuelPrice: "",
    lifetime: "",
    annualMaintenance: ""
  };
}

function selectedCo2Factor(configuration, source) {
  return source === "Brenselcelle" ? toNumber(configuration.other.co2Methanol) : toNumber(configuration.other.co2Diesel);
}

function calculateMonthlyEnergyBalance(configuration, totalWhPerDay, source) {
  const sourceConfig = selectedSourceConfig(configuration, source);
  const secondarySourcePowerKw = toNumber(sourceConfig.powerW) / 1000;
  const fuelConsumptionPerKWh = toNumber(sourceConfig.fuelConsumptionPerKWh);
  const fuelPrice = toNumber(sourceConfig.fuelPrice);
  const panelCount = toNumber(configuration.solar.panelCount);
  const panelPowerWp = toNumber(configuration.solar.panelPowerWp);
  const systemEfficiency = toNumber(configuration.solar.systemEfficiency);

  return MONTH_KEYS.map((month) => {
    const daysInMonth = DAYS_IN_MONTH[month];
    const solarProductionKWh =
      toNumber(configuration.monthlySolarRadiation[month]) * panelCount * (panelPowerWp / 1000) * systemEfficiency;
    const loadDemandKWh = (totalWhPerDay * daysInMonth) / 1000;
    const energyBalanceKWh = solarProductionKWh - loadDemandKWh;
    const deficitKWh = Math.max(0, Math.abs(Math.min(0, energyBalanceKWh)));
    const secondaryRuntimeHours = secondarySourcePowerKw > 0 ? deficitKWh / secondarySourcePowerKw : 0;
    const fuelLiters = deficitKWh * fuelConsumptionPerKWh;
    const fuelCost = fuelLiters * fuelPrice;

    return {
      month,
      label: MONTH_LABELS[month],
      daysInMonth,
      solarProductionKWh,
      loadDemandKWh,
      energyBalanceKWh,
      secondaryRuntimeHours,
      fuelLiters,
      fuelCost
    };
  });
}

function calculateCostComparison(configuration, annualEnergyDeficitKWh) {
  if (configuration.backupSource.hasBackupSource !== true) {
    return {
      annualEnergyDeficitKWh: round(annualEnergyDeficitKWh, 2),
      items: []
    };
  }

  const evaluationHorizonYears = toNumber(configuration.other.evaluationHorizonYears);
  const buildItem = (source) => {
    const config = selectedSourceConfig(configuration, source);
    const annualFuelConsumption = annualEnergyDeficitKWh * toNumber(config.fuelConsumptionPerKWh);
    const operatingCostPerYear = annualFuelConsumption * toNumber(config.fuelPrice);
    const annualMaintenance = toNumber(config.annualMaintenance);
    const purchaseCost = toNumber(config.purchaseCost);
    const annualCo2 = annualFuelConsumption * selectedCo2Factor(configuration, source);

    return {
      source,
      purchaseCost: round(purchaseCost, 2),
      operatingCostPerYear: round(operatingCostPerYear, 2),
      annualMaintenance: round(annualMaintenance, 2),
      evaluationHorizonYears: round(evaluationHorizonYears, 2),
      annualFuelConsumption: round(annualFuelConsumption, 2),
      annualCo2: round(annualCo2, 2),
      toc: round(purchaseCost + (operatingCostPerYear + annualMaintenance) * evaluationHorizonYears, 2)
    };
  };

  return {
    annualEnergyDeficitKWh: round(annualEnergyDeficitKWh, 2),
    items: [buildItem("Brenselcelle"), buildItem("Dieselaggregat")]
  };
}

function createEmptyScenario(source, totalWhPerDay, totalAhPerDay) {
  return {
    source,
    monthlyEnergyBalance: [],
    annualTotals: createEmptyAnnualTotals(totalWhPerDay, totalAhPerDay),
    secondarySourcePowerW: 0,
    costItem: null
  };
}

function createScenario(configuration, source, totalWhPerDay, totalAhPerDay, costItem) {
  const monthlyEnergyBalance = calculateMonthlyEnergyBalance(configuration, totalWhPerDay, source);

  return {
    source,
    monthlyEnergyBalance,
    annualTotals: createAnnualTotals(monthlyEnergyBalance, totalWhPerDay, totalAhPerDay),
    secondarySourcePowerW: round(toNumber(selectedSourceConfig(configuration, source).powerW), 2),
    costItem
  };
}

function describeFieldList(fields) {
  const uniqueFields = Array.from(new Set(fields));

  if (uniqueFields.length === 0) {
    return "";
  }

  if (uniqueFields.length === 1) {
    return uniqueFields[0];
  }

  if (uniqueFields.length === 2) {
    return `${uniqueFields[0]} og ${uniqueFields[1]}`;
  }

  return `${uniqueFields.slice(0, -1).join(", ")} og ${uniqueFields[uniqueFields.length - 1]}`;
}

function humanizeQuestionLabel(key, configuration) {
  const labels = {
    "backupSource.hasBackupSource": "om systemet har reservekjelde",
    "battery.batteryMode": "korleis batteribanken skal oppgivast",
    "battery.batteryValue":
      configuration.battery.batteryMode === "ah"
        ? "batteribank i Ah"
        : "ønskt autonomi i dagar",
    "solar.panelPowerWp": "paneleffekt per panel (Wp)",
    "solar.panelCount": "tal panel",
    "solar.systemEfficiency": "systemverknadsgrad (0-1)",    "battery.nominalVoltage": "nominell batterispenning (V)",
    "battery.maxDepthOfDischarge": "maks utladingsdjupn (0-1)",    "other.evaluationHorizonYears": "vurderingshorisont i år",
    "other.co2Methanol": "CO2-faktor for brenselcelle",
    "other.co2Diesel": "CO2-faktor for diesel",
    "fuelCell.purchaseCost": "innkjøpskostnad for brenselcelle",
    "fuelCell.powerW": "effekt for brenselcelle",
    "fuelCell.fuelConsumptionPerKWh": "drivstofforbruk for brenselcelle",
    "fuelCell.fuelPrice": "drivstoffpris for brenselcelle",
    "fuelCell.lifetime": "teknisk levetid for brenselcelle i timar",
    "fuelCell.annualMaintenance": "årleg vedlikehald for brenselcelle",
    "diesel.purchaseCost": "innkjøpskostnad for dieselaggregat",
    "diesel.powerW": "effekt for dieselaggregat",
    "diesel.fuelConsumptionPerKWh": "drivstofforbruk for dieselaggregat",
    "diesel.fuelPrice": "drivstoffpris for dieselaggregat",
    "diesel.lifetime": "teknisk levetid for dieselaggregat i timar",
    "diesel.annualMaintenance": "årleg vedlikehald for dieselaggregat"
  };

  if (labels[key]) {
    return labels[key];
  }

  if (key.startsWith("monthlySolarRadiation.")) {
    const month = key.slice("monthlySolarRadiation.".length);
    return `solinnstråling for ${MONTH_LABELS[month] ?? month}`;
  }

  return key;
}

function pickCalculationInputs(configuration) {
  return {
    backupSource: {
      hasBackupSource: configuration.backupSource.hasBackupSource
    },
    solar: {
      panelPowerWp: configuration.solar.panelPowerWp,
      panelCount: configuration.solar.panelCount,
      systemEfficiency: configuration.solar.systemEfficiency
    },
    battery: {
      batteryMode: configuration.battery.batteryMode,
      batteryValue: configuration.battery.batteryValue,
      nominalVoltage: configuration.battery.nominalVoltage,
      maxDepthOfDischarge: configuration.battery.maxDepthOfDischarge
    },
    fuelCell: {
      purchaseCost: configuration.fuelCell.purchaseCost,
      powerW: configuration.fuelCell.powerW,
      fuelConsumptionPerKWh: configuration.fuelCell.fuelConsumptionPerKWh,
      fuelPrice: configuration.fuelCell.fuelPrice,
      lifetime: configuration.fuelCell.lifetime,
      annualMaintenance: configuration.fuelCell.annualMaintenance
    },
    diesel: {
      purchaseCost: configuration.diesel.purchaseCost,
      powerW: configuration.diesel.powerW,
      fuelConsumptionPerKWh: configuration.diesel.fuelConsumptionPerKWh,
      fuelPrice: configuration.diesel.fuelPrice,
      lifetime: configuration.diesel.lifetime,
      annualMaintenance: configuration.diesel.annualMaintenance
    },
    other: {
      evaluationHorizonYears: configuration.other.evaluationHorizonYears,
      co2Methanol: configuration.other.co2Methanol,
      co2Diesel: configuration.other.co2Diesel
    },
    monthlySolarRadiation: { ...configuration.monthlySolarRadiation },
    equipmentBudgetSettings: {
      displayUnit: configuration.equipmentBudgetSettings.displayUnit
    },
    equipmentRows: configuration.equipmentRows.map((row) => ({
      id: row.id,
      active: row.active,
      name: row.name,
      powerW: row.powerW,
      runtimeHoursPerDay: row.runtimeHoursPerDay
    }))
  };
}
function buildCalculationQuestions(validationErrors, configuration) {
  if (!validationErrors || Object.keys(validationErrors).length === 0) {
    return [];
  }

  const questions = [];
  const hasError = (key) => Object.prototype.hasOwnProperty.call(validationErrors, key);

  if (hasError("backupSource.hasBackupSource")) {
    questions.push({
      id: "has_backup_source",
      question: "Har systemet reservekjelde?",
      fields: ["backupSource.hasBackupSource"],
      allowed_values: QUESTION_ALLOWED_VALUES["backupSource.hasBackupSource"]
    });
  }

  if (hasError("battery.batteryMode")) {
    questions.push({
      id: "battery_mode",
      question: "Korleis vil du oppgi batteribanken?",
      fields: ["battery.batteryMode"],
      allowed_values: QUESTION_ALLOWED_VALUES["battery.batteryMode"]
    });
  }

  if (hasError("battery.batteryValue")) {
    questions.push({
      id: "battery_value",
      question:
        configuration.battery.batteryMode === "ah"
          ? "Kva batteribank i Ah vil du bruke?"
          : "Kor mange dagar ønskja autonomi vil du bruke?",
      fields: ["battery.batteryValue"],
      allowed_values: null
    });
  }

  const groupedFieldSets = [
    {
      id: "solar_setup",
      fields: ["solar.panelPowerWp", "solar.panelCount", "solar.systemEfficiency"],
      questionPrefix: "Fyll inn solcellegrunnlaget"
    },
    {
      id: "battery_setup",
      fields: ["battery.batteryMode", "battery.batteryValue", "battery.nominalVoltage", "battery.maxDepthOfDischarge"],
      questionPrefix: "Fyll inn batterigrunnlaget"
    },
    {
      id: "fuel_cell_setup",
      fields: [
        "fuelCell.purchaseCost",
        "fuelCell.powerW",
        "fuelCell.fuelConsumptionPerKWh",
        "fuelCell.fuelPrice",
        "fuelCell.lifetime",
        "fuelCell.annualMaintenance"
      ],
      questionPrefix: "Fyll inn manglande verdiar for brenselcelle"
    },
    {
      id: "diesel_setup",
      fields: [
        "diesel.purchaseCost",
        "diesel.powerW",
        "diesel.fuelConsumptionPerKWh",
        "diesel.fuelPrice",
        "diesel.lifetime",
        "diesel.annualMaintenance"
      ],
      questionPrefix: "Fyll inn manglande verdiar for dieselaggregat"
    },
    {
      id: "other_setup",
      fields: ["other.evaluationHorizonYears", "other.co2Methanol", "other.co2Diesel"],
      questionPrefix: "Fyll inn manglande økonomidata"
    }
  ];

  for (const group of groupedFieldSets) {
    const missingFields = group.fields.filter(hasError);
    if (missingFields.length === 0) {
      continue;
    }

    questions.push({
      id: group.id,
      question: `${group.questionPrefix}: ${describeFieldList(
        missingFields.map((field) => humanizeQuestionLabel(field, configuration))
      )}.`,
      fields: missingFields,
      allowed_values: null
    });
  }

  const missingMonths = MONTH_KEYS.filter((month) => hasError(`monthlySolarRadiation.${month}`));
  if (missingMonths.length > 0) {
    questions.push({
      id: "monthly_solar_radiation",
      question: `Oppgi solinnstråling for: ${missingMonths.map((month) => MONTH_LABELS[month]).join(", ")}.`,
      fields: missingMonths.map((month) => `monthlySolarRadiation.${month}`),
      allowed_values: null
    });
  }

  const equipmentErrorsByRow = new Map();
  for (const key of Object.keys(validationErrors)) {
    if (!key.startsWith("equipmentRows.")) {
      continue;
    }

    const match = key.match(/^equipmentRows\.([^.]+)\.(.+)$/);
    if (!match) {
      continue;
    }

    const [, rowId, field] = match;
    if (!equipmentErrorsByRow.has(rowId)) {
      equipmentErrorsByRow.set(rowId, []);
    }
    equipmentErrorsByRow.get(rowId).push(field);
  }

  for (const [rowId, fields] of equipmentErrorsByRow.entries()) {
    const row = configuration.equipmentRows.find((item) => item.id === rowId);
    const rowName = row?.name?.trim() || rowId;
    const labels = [];

    if (fields.includes("name")) {
      labels.push("namn");
    }
    if (fields.includes("powerW")) {
      labels.push("effekt i watt");
    }
    if (fields.includes("runtimeHoursPerDay")) {
      labels.push("timar per døgn");
    }

    questions.push({
      id: `equipment_row_${rowId}`,
      question: `Fullfør utstyrsrad ${rowName}: oppgi ${describeFieldList(labels)}.`,
      fields: fields.map((field) => `equipmentRows.${rowId}.${field}`),
      allowed_values: null
    });
  }

  return questions;
}

export function calculateNumericResults(configuration) {
  const equipmentBudgetRows = calculateEquipmentBudgetRows(
    configuration.equipmentRows,
    configuration.battery.nominalVoltage
  );
  const totalWhPerDay = round(equipmentBudgetRows.reduce((sum, row) => sum + row.whPerDay, 0), 2);
  const totalAhPerDay = round(equipmentBudgetRows.reduce((sum, row) => sum + row.ahPerDay, 0), 2);
  const batteryCapacityAh = calculateBatteryCapacityAh(configuration, totalWhPerDay);
  const batteryAutonomyDays = calculateBatteryAutonomyDays(configuration, totalWhPerDay, batteryCapacityAh);

  const backupSourceInput = (configuration._backupSource ?? "").toLowerCase();
  const selectedSource =
    configuration.backupSource.hasBackupSource !== true
      ? "Ikkje berekna"
      : backupSourceInput === "diesel"
        ? "Dieselaggregat"
        : "Brenselcelle";
  const monthlyEnergyBalance = calculateMonthlyEnergyBalance(configuration, totalWhPerDay, selectedSource);
  const annualEnergyDeficitKWh = monthlyEnergyBalance.reduce(
    (sum, row) => sum + Math.max(0, row.loadDemandKWh - row.solarProductionKWh),
    0
  );
  const costComparison = calculateCostComparison(configuration, annualEnergyDeficitKWh);
  const costItemsBySource = new Map(costComparison.items.map((item) => [item.source, item]));
  const scenarios = {
    fuelCell: createScenario(
      configuration,
      "Brenselcelle",
      totalWhPerDay,
      totalAhPerDay,
      costItemsBySource.get("Brenselcelle") ?? null
    ),
    diesel: createScenario(
      configuration,
      "Dieselaggregat",
      totalWhPerDay,
      totalAhPerDay,
      costItemsBySource.get("Dieselaggregat") ?? null
    )
  };

  return {
    equipmentBudgetRows,
    totals: {
      totalWhPerDay,
      totalAhPerDay,
      totalWhPerWeek: round(totalWhPerDay * 7, 2),
      totalAhPerWeek: round(totalAhPerDay * 7, 2)
    },
    battery: {
      inputMode: configuration.battery.batteryMode,
      inputValue: toNumber(configuration.battery.batteryValue),
      capacityAh: batteryCapacityAh,
      autonomyDays: batteryAutonomyDays
    },
    annualEnergyDeficitKWh,
    monthlyEnergyBalance,
    annualTotals: createAnnualTotals(monthlyEnergyBalance, totalWhPerDay, totalAhPerDay),
    costComparison,
    scenarios
  };
}

function buildCalculationResponse(raw) {
  const configuration = normalizeCalculationRequest(raw);
  const validationErrors = validateCalculationRequest(configuration);
  const inputsUsed = pickCalculationInputs(configuration);
  const questions = buildCalculationQuestions(validationErrors, configuration);

  if (Object.keys(validationErrors).length > 0) {
    return {
      valid: false,
      configuration,
      inputsUsed,
      validationErrors,
      questions,
      calculations: null
    };
  }

  return {
    valid: true,
    configuration,
    inputsUsed,
    validationErrors: {},
    questions,
    calculations: calculateNumericResults(configuration)
  };
}
