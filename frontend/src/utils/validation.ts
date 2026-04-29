import { ANSWER_KEYS, MONTH_KEYS } from "../constants";
import type { Language } from "../i18n";
import { Answers, EditableNumber, PlantConfiguration, ValidationErrors } from "../types";

interface ValidationStrings {
  fieldRequired: (label: string) => string;
  fieldMustBeNumber: (label: string) => string;
  fieldMustBeGreaterThan: (label: string, min: number) => string;
  fieldMustBeGteq: (label: string, min: number) => string;
  fieldMustBeLteq: (label: string, max: number) => string;
  thisFieldRequired: string;
  valueMustBePositive: string;
  coverage4g: string;
  coverageNbIot: string;
  lineOfSight: string;
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
  fieldRequired: (label) => `${label} må fyllast ut.`,
  fieldMustBeNumber: (label) => `${label} må vere eit gyldig tal.`,
  fieldMustBeGreaterThan: (label, min) => `${label} må vere større enn ${min}.`,
  fieldMustBeGteq: (label, min) => `${label} må vere lik eller større enn ${min}.`,
  fieldMustBeLteq: (label, max) => `${label} må vere mindre enn eller lik ${max}.`,
  thisFieldRequired: "Dette feltet må fyllast ut.",
  valueMustBePositive: "Verdien må vere eit tal større enn 0.",
  coverage4g: "4G-dekning må avklarast.",
  coverageNbIot: "NB-IoT-dekning må avklarast.",
  lineOfSight: "Fri sikt under 15 km må avklarast.",
  reserveSourceRequired: "Det må avklarast om systemet har reservekjelde.",
  batteryModeRequired: "Batterimodus må veljast.",
  inspectionsLabel: "Tal tilsyn per år",
  batteryValueLabel: "Batteriverdi",
  panelPowerLabel: "Paneleffekt",
  panelCountLabel: "Tal panel",
  systemEfficiencyLabel: "Systemverknadsgrad",
  nominalVoltageLabel: "Nominell spenning",
  maxDodLabel: "Maks utladingsdjupn",
  fuelCellPurchaseLabel: "Innkjøpskostnad brenselcelle",
  fuelCellPowerLabel: "Effekt brenselcelle",
  fuelCellConsumptionLabel: "Drivstofforbruk brenselcelle",
  fuelCellPriceLabel: "Drivstoffpris brenselcelle",
  fuelCellLifetimeLabel: "Levetid brenselcelle",
  fuelCellMaintenanceLabel: "Årleg vedlikehald brenselcelle",
  dieselPurchaseLabel: "Innkjøpskostnad diesel",
  dieselPowerLabel: "Effekt diesel",
  dieselConsumptionLabel: "Drivstofforbruk diesel",
  dieselPriceLabel: "Drivstoffpris diesel",
  dieselLifetimeLabel: "Levetid diesel",
  dieselMaintenanceLabel: "Årleg vedlikehald diesel",
  horizonLabel: "Vurderingshorisont",
  co2FuelCellLabel: "CO2-faktor for brenselcelle",
  co2DieselLabel: "CO2-faktor for diesel",
  solarRadiationLabel: (month) => `Solinnstråling ${month.toUpperCase()}`,
  equipmentRowName: "Utstyrsrada må ha namn.",
  equipmentRowPower: "Aktiv rad må ha effekt.",
  powerNegative: "Effekt kan ikkje vere negativ.",
  equipmentRowHours: "Aktiv rad må ha timar per døgn.",
  hoursNegative: "Timar per døgn kan ikkje vere negativ.",
  hoursPositive: "Timar per døgn må vere større enn 0.",
  hoursMax24: "Timar per døgn kan ikkje vere større enn 24."
};

const en: ValidationStrings = {
  fieldRequired: (label) => `${label} is required.`,
  fieldMustBeNumber: (label) => `${label} must be a valid number.`,
  fieldMustBeGreaterThan: (label, min) => `${label} must be greater than ${min}.`,
  fieldMustBeGteq: (label, min) => `${label} must be equal to or greater than ${min}.`,
  fieldMustBeLteq: (label, max) => `${label} must be less than or equal to ${max}.`,
  thisFieldRequired: "This field is required.",
  valueMustBePositive: "The value must be a number greater than 0.",
  coverage4g: "4G coverage must be confirmed.",
  coverageNbIot: "NB-IoT coverage must be confirmed.",
  lineOfSight: "Line of sight within 15 km must be confirmed.",
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

function solarAutoLabel(kind: "lat" | "lon" | "tilt" | "azimuth"): string {
  if (activeLanguage === "nn") {
    return {
      lat: "Breiddegrad",
      lon: "Lengdegrad",
      tilt: "Panelhelling",
      azimuth: "Azimut"
    }[kind];
  }

  return {
    lat: "Latitude",
    lon: "Longitude",
    tilt: "Panel tilt",
    azimuth: "Azimuth"
  }[kind];
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

  ANSWER_KEYS.forEach((field) => {
    if (answers[field] === "" || answers[field] === null || answers[field] === undefined) {
      errors[field] = s().thisFieldRequired;
    }
  });

  if (answers.q2HogasteMinstevassforing !== "" && Number(answers.q2HogasteMinstevassforing) <= 0) {
    errors.q2HogasteMinstevassforing = s().valueMustBePositive;
  }

  return errors;
}

function validateRecommendationAccess(configuration: Pick<PlantConfiguration, "name" | "answers">): ValidationErrors {
  return validateAnswers(configuration.answers);
}

export function validateConfiguration(configuration: PlantConfiguration): ValidationErrors {
  const errors: ValidationErrors = {};
  const calculatorMode = (configuration.engineMode ?? "standard") === "standard";
  const usesSolarAuto =
    (configuration.engineMode ?? "standard") === "detailed" && configuration.solarRadiationSettings.mode === "auto";

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

  if (!calculatorMode && configuration.systemParameters["4gCoverage"] === null) {
    errors["systemParameters.4gCoverage"] = s().coverage4g;
  }

  if (!calculatorMode && configuration.systemParameters.nbIotCoverage === null) {
    errors["systemParameters.nbIotCoverage"] = s().coverageNbIot;
  }

  if (!calculatorMode && configuration.systemParameters.lineOfSightUnder15km === null) {
    errors["systemParameters.lineOfSightUnder15km"] = s().lineOfSight;
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

  if (usesSolarAuto) {
    validateRequiredNumber(
      errors,
      "solarRadiationSettings.lat",
      configuration.solarRadiationSettings.lat,
      solarAutoLabel("lat"),
      { min: -90, max: 90, allowZero: true }
    );
    validateRequiredNumber(
      errors,
      "solarRadiationSettings.lon",
      configuration.solarRadiationSettings.lon,
      solarAutoLabel("lon"),
      { min: -180, max: 180, allowZero: true }
    );
    validateRequiredNumber(
      errors,
      "solarRadiationSettings.tilt",
      configuration.solarRadiationSettings.tilt,
      solarAutoLabel("tilt"),
      { min: 0, max: 90, allowZero: true }
    );
    validateRequiredNumber(
      errors,
      "solarRadiationSettings.azimuth",
      configuration.solarRadiationSettings.azimuth,
      solarAutoLabel("azimuth"),
      { min: 0, max: 360, allowZero: true }
    );
  } else {
    MONTH_KEYS.forEach((month) => {
      validateRequiredNumber(
        errors,
        `monthlySolarRadiation.${month}`,
        configuration.monthlySolarRadiation[month],
        s().solarRadiationLabel(month),
        { min: 0, allowZero: true }
      );
    });
  }

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
