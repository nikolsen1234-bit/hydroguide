import type { Language } from "../i18n";
import { MONTH_KEYS } from "../constants";
import { visibleQuestionsForAnswers } from "../questions";
import { Answers, EditableNumber, PlantConfiguration, ValidationErrors } from "../types";

interface ValidationStrings {
  fieldRequired: (label: string) => string;
  fieldMustBeNumber: (label: string) => string;
  fieldMustBeGreaterThan: (label: string, min: number) => string;
  fieldMustBeGteq: (label: string, min: number) => string;
  fieldMustBeLteq: (label: string, max: number) => string;
  thisFieldRequired: string;
  valueMustBePositive: string;
  reserveSourceRequired: string;
  batteryModeRequired: string;
  inspectionsLabel: string;
  batteryValueLabel: string;
  panelPowerLabel: string;
  panelCountLabel: string;
  systemEfficiencyLabel: string;
  nominalVoltageLabel: string;
  maxDodLabel: string;
  fuelCellPurchaseLabel: string;
  fuelCellPowerLabel: string;
  fuelCellConsumptionLabel: string;
  fuelCellPriceLabel: string;
  fuelCellLifetimeLabel: string;
  fuelCellMaintenanceLabel: string;
  dieselPurchaseLabel: string;
  dieselPowerLabel: string;
  dieselConsumptionLabel: string;
  dieselPriceLabel: string;
  dieselLifetimeLabel: string;
  dieselMaintenanceLabel: string;
  horizonLabel: string;
  co2FuelCellLabel: string;
  co2DieselLabel: string;
  solarRadiationLabel: (month: string) => string;
  equipmentRowName: string;
  equipmentRowPower: string;
  powerNegative: string;
  equipmentRowHours: string;
  hoursNegative: string;
  hoursPositive: string;
  hoursMax24: string;
}

const nn: ValidationStrings = {
  fieldRequired: (label) => `${label} må fylles ut.`,
  fieldMustBeNumber: (label) => `${label} må være et gyldig tall.`,
  fieldMustBeGreaterThan: (label, min) => `${label} må være større enn ${min}.`,
  fieldMustBeGteq: (label, min) => `${label} må være lik eller større enn ${min}.`,
  fieldMustBeLteq: (label, max) => `${label} må være mindre enn eller lik ${max}.`,
  thisFieldRequired: "Dette feltet må fylles ut.",
  valueMustBePositive: "Verdien må være et tall større enn 0.",
  reserveSourceRequired: "Det må avklares om systemet har reservekilde.",
  batteryModeRequired: "Batterimodus må velges.",
  inspectionsLabel: "Antall tilsyn per år",
  batteryValueLabel: "Batteriverdi",
  panelPowerLabel: "Paneleffekt",
  panelCountLabel: "Antall panel",
  systemEfficiencyLabel: "Systemvirkningsgrad",
  nominalVoltageLabel: "Nominell spenning",
  maxDodLabel: "Maks utladingsdybde",
  fuelCellPurchaseLabel: "Innkjøpskostnad brenselcelle",
  fuelCellPowerLabel: "Effekt brenselcelle",
  fuelCellConsumptionLabel: "Drivstofforbruk brenselcelle",
  fuelCellPriceLabel: "Drivstoffpris brenselcelle",
  fuelCellLifetimeLabel: "Levetid brenselcelle",
  fuelCellMaintenanceLabel: "Årlig vedlikehold brenselcelle",
  dieselPurchaseLabel: "Innkjøpskostnad diesel",
  dieselPowerLabel: "Effekt diesel",
  dieselConsumptionLabel: "Drivstofforbruk diesel",
  dieselPriceLabel: "Drivstoffpris diesel",
  dieselLifetimeLabel: "Levetid diesel",
  dieselMaintenanceLabel: "Årlig vedlikehold diesel",
  horizonLabel: "Vurderingshorisont",
  co2FuelCellLabel: "CO2-faktor for brenselcelle",
  co2DieselLabel: "CO2-faktor for diesel",
  solarRadiationLabel: (month) => `Solinnstråling ${month.toUpperCase()}`,
  equipmentRowName: "Utstyrsraden må ha navn.",
  equipmentRowPower: "Aktiv rad må ha effekt.",
  powerNegative: "Effekt kan ikke være negativ.",
  equipmentRowHours: "Aktiv rad må ha timer per døgn.",
  hoursNegative: "Timer per døgn kan ikke være negativ.",
  hoursPositive: "Timer per døgn må være større enn 0.",
  hoursMax24: "Timer per døgn kan ikke være større enn 24."
};

const en: ValidationStrings = {
  fieldRequired: (label) => `${label} is required.`,
  fieldMustBeNumber: (label) => `${label} must be a valid number.`,
  fieldMustBeGreaterThan: (label, min) => `${label} must be greater than ${min}.`,
  fieldMustBeGteq: (label, min) => `${label} must be equal to or greater than ${min}.`,
  fieldMustBeLteq: (label, max) => `${label} must be less than or equal to ${max}.`,
  thisFieldRequired: "This field is required.",
  valueMustBePositive: "The value must be a number greater than 0.",
  reserveSourceRequired: "Whether the system has a reserve source must be confirmed.",
  batteryModeRequired: "Battery mode must be selected.",
  inspectionsLabel: "Inspections per year",
  batteryValueLabel: "Battery value",
  panelPowerLabel: "Panel power",
  panelCountLabel: "Number of panels",
  systemEfficiencyLabel: "System efficiency",
  nominalVoltageLabel: "Nominal voltage",
  maxDodLabel: "Max depth of discharge",
  fuelCellPurchaseLabel: "Purchase cost fuel cell",
  fuelCellPowerLabel: "Power fuel cell",
  fuelCellConsumptionLabel: "Fuel consumption fuel cell",
  fuelCellPriceLabel: "Fuel price fuel cell",
  fuelCellLifetimeLabel: "Lifetime fuel cell",
  fuelCellMaintenanceLabel: "Annual maintenance fuel cell",
  dieselPurchaseLabel: "Purchase cost diesel",
  dieselPowerLabel: "Power diesel",
  dieselConsumptionLabel: "Fuel consumption diesel",
  dieselPriceLabel: "Fuel price diesel",
  dieselLifetimeLabel: "Lifetime diesel",
  dieselMaintenanceLabel: "Annual maintenance diesel",
  horizonLabel: "Planning horizon",
  co2FuelCellLabel: "CO2 factor for fuel cell",
  co2DieselLabel: "CO2 factor for diesel",
  solarRadiationLabel: (month) => `Solar radiation ${month.toUpperCase()}`,
  equipmentRowName: "Equipment row must have a name.",
  equipmentRowPower: "Active row must have a power value.",
  powerNegative: "Power cannot be negative.",
  equipmentRowHours: "Active row must have hours per day.",
  hoursNegative: "Hours per day cannot be negative.",
  hoursPositive: "Hours per day must be greater than 0.",
  hoursMax24: "Hours per day cannot exceed 24."
};

const strings: Record<Language, ValidationStrings> = { nn, en };

let activeLanguage: Language = "nn";

export function setValidationLanguage(lang: Language) {
  activeLanguage = lang;
}

function s(): ValidationStrings {
  return strings[activeLanguage];
}

function isEmptyNumber(value: EditableNumber): boolean {
  return value === "" || value === null || value === undefined;
}

function validateRequiredNumber(
  errors: ValidationErrors,
  key: string,
  value: EditableNumber,
  label: string,
  options?: { min?: number; max?: number; allowZero?: boolean }
) {
  if (isEmptyNumber(value)) {
    errors[key] = s().fieldRequired(label);
    return;
  }

  const numericValue = Number(value);
  const min = options?.min ?? 0;
  const allowZero = options?.allowZero ?? false;

  if (Number.isNaN(numericValue)) {
    errors[key] = s().fieldMustBeNumber(label);
    return;
  }

  if (allowZero ? numericValue < min : numericValue <= min) {
    errors[key] = allowZero ? s().fieldMustBeGteq(label, min) : s().fieldMustBeGreaterThan(label, min);
    return;
  }

  if (options?.max !== undefined && numericValue > options.max) {
    errors[key] = s().fieldMustBeLteq(label, options.max);
  }
}

function validateAnswers(answers: Answers): ValidationErrors {
  const errors: ValidationErrors = {};

  visibleQuestionsForAnswers(answers).forEach(({ key: field, required }) => {
    if (required === false) {
      return;
    }

    const value = answers[field];
    if (value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      errors[field] = s().thisFieldRequired;
    }
  });

  return errors;
}

function validateRecommendationAccess(configuration: Pick<PlantConfiguration, "name" | "answers">): ValidationErrors {
  return validateAnswers(configuration.answers);
}

export function validateConfiguration(configuration: PlantConfiguration): ValidationErrors {
  const errors: ValidationErrors = {};
  const calculatorMode = (configuration.engineMode ?? "calculator") === "calculator";

  if (!calculatorMode) {
    Object.assign(errors, validateRecommendationAccess(configuration));
  }

  if (!calculatorMode) {
    validateRequiredNumber(
      errors,
      "other.evaluationHorizonYears",
      configuration.other.evaluationHorizonYears,
      s().horizonLabel
    );
  }

  if (configuration.systemParameters.hasBackupSource === null) {
    errors["systemParameters.hasBackupSource"] = s().reserveSourceRequired;
  }

  if (!configuration.systemParameters.batteryMode) {
    errors["systemParameters.batteryMode"] = s().batteryModeRequired;
  }

  if (!calculatorMode) {
    validateRequiredNumber(
      errors,
      "systemParameters.inspectionsPerYear",
      configuration.systemParameters.inspectionsPerYear,
      s().inspectionsLabel,
      { min: 0, allowZero: true }
    );
  }
  validateRequiredNumber(errors, "systemParameters.batteryValue", configuration.systemParameters.batteryValue, s().batteryValueLabel);

  validateRequiredNumber(errors, "solar.panelPowerWp", configuration.solar.panelPowerWp, s().panelPowerLabel);
  validateRequiredNumber(errors, "solar.panelCount", configuration.solar.panelCount, s().panelCountLabel);
  validateRequiredNumber(errors, "solar.systemEfficiency", configuration.solar.systemEfficiency, s().systemEfficiencyLabel, {
    min: 0,
    max: 1
  });

  validateRequiredNumber(errors, "battery.nominalVoltage", configuration.battery.nominalVoltage, s().nominalVoltageLabel);
  validateRequiredNumber(
    errors,
    "battery.maxDepthOfDischarge",
    configuration.battery.maxDepthOfDischarge,
    s().maxDodLabel,
    { min: 0, max: 1 }
  );

  if (configuration.systemParameters.hasBackupSource === true) {
    for (const sourceKey of ["fuelCell", "diesel"] as const) {
      const source = configuration[sourceKey];
      const labels =
        sourceKey === "fuelCell"
          ? {
              purchase: s().fuelCellPurchaseLabel,
              power: s().fuelCellPowerLabel,
              consumption: s().fuelCellConsumptionLabel,
              price: s().fuelCellPriceLabel,
              lifetime: s().fuelCellLifetimeLabel,
              maintenance: s().fuelCellMaintenanceLabel
            }
          : {
              purchase: s().dieselPurchaseLabel,
              power: s().dieselPowerLabel,
              consumption: s().dieselConsumptionLabel,
              price: s().dieselPriceLabel,
              lifetime: s().dieselLifetimeLabel,
              maintenance: s().dieselMaintenanceLabel
            };

      validateRequiredNumber(errors, `${sourceKey}.purchaseCost`, source.purchaseCost, labels.purchase, {
        min: 0,
        allowZero: true
      });
      validateRequiredNumber(errors, `${sourceKey}.powerW`, source.powerW, labels.power);
      validateRequiredNumber(errors, `${sourceKey}.fuelConsumptionPerKWh`, source.fuelConsumptionPerKWh, labels.consumption, {
        min: 0,
        allowZero: true
      });
      validateRequiredNumber(errors, `${sourceKey}.fuelPrice`, source.fuelPrice, labels.price, {
        min: 0,
        allowZero: true
      });
      validateRequiredNumber(errors, `${sourceKey}.lifetime`, source.lifetime, labels.lifetime);
      validateRequiredNumber(errors, `${sourceKey}.annualMaintenance`, source.annualMaintenance, labels.maintenance, {
        min: 0,
        allowZero: true
      });
    }

    validateRequiredNumber(
      errors,
      "other.co2Methanol",
      configuration.other.co2Methanol,
      s().co2FuelCellLabel,
      { min: 0, allowZero: true }
    );
    validateRequiredNumber(
      errors,
      "other.co2Diesel",
      configuration.other.co2Diesel,
      s().co2DieselLabel,
      { min: 0, allowZero: true }
    );
  }

  MONTH_KEYS.forEach((month) => {
    validateRequiredNumber(
      errors,
      `monthlySolarRadiation.${month}`,
      configuration.monthlySolarRadiation[month],
      s().solarRadiationLabel(month),
      { min: 0, allowZero: true }
    );
  });

  configuration.equipmentRows.forEach((row) => {
    if ((row.active || row.powerW !== "") && !row.name.trim()) {
      errors[`equipmentRows.${row.id}.name`] = s().equipmentRowName;
    }

    if (row.active && row.powerW === "") {
      errors[`equipmentRows.${row.id}.powerW`] = s().equipmentRowPower;
    } else if (row.powerW !== "" && Number(row.powerW) < 0) {
      errors[`equipmentRows.${row.id}.powerW`] = s().powerNegative;
    }

    if (row.active && row.runtimeHoursPerDay === "") {
      errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = s().equipmentRowHours;
    } else if (row.runtimeHoursPerDay !== "") {
      const runtimeHours = Number(row.runtimeHoursPerDay);

      if (runtimeHours < 0) {
        errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = s().hoursNegative;
      } else if (row.active && runtimeHours === 0) {
        errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = s().hoursPositive;
      } else if (runtimeHours > 24) {
        errors[`equipmentRows.${row.id}.runtimeHoursPerDay`] = s().hoursMax24;
      }
    }
  });

  return errors;
}
