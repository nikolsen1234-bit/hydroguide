export type ApiEditableNumber = number | "";

export interface ApiEquipmentBudgetRow {
  id: string;
  active: boolean;
  name: string;
  powerW: number;
  currentA: number;
  runtimeHoursPerDay: number;
  whPerDay: number;
  ahPerDay: number;
  whPerMonth: number;
  ahPerMonth: number;
  whPerWeek: number;
  ahPerWeek: number;
}

export interface ApiMonthlyEnergyBalanceRow {
  month: string;
  label: string;
  daysInMonth: number;
  solarProductionKWh: number;
  loadDemandKWh: number;
  energyBalanceKWh: number;
  secondaryRuntimeHours: number;
  fuelLiters: number;
  fuelCost: number;
}

export interface ApiAnnualTotals {
  totalWhPerDay: number;
  totalAhPerDay: number;
  totalWhPerWeek: number;
  totalAhPerWeek: number;
  annualSolarProductionKWh: number;
  annualLoadDemandKWh: number;
  annualEnergyBalanceKWh: number;
  annualSecondaryRuntimeHours: number;
  annualFuelConsumption: number;
  annualFuelCost: number;
}

export interface ApiCostComparisonItem {
  source: "Brenselcelle" | "Dieselaggregat";
  purchaseCost: number;
  operatingCostPerYear: number;
  annualMaintenance: number;
  evaluationHorizonYears: number;
  technicalLifetimeHours: number;
  totalRuntimeHours: number;
  replacementCount: number;
  annualFuelConsumption: number;
  annualCo2: number;
  toc: number;
}

export interface ApiReserveScenario {
  source: "Brenselcelle" | "Dieselaggregat";
  monthlyEnergyBalance: ApiMonthlyEnergyBalanceRow[];
  annualTotals: ApiAnnualTotals;
  secondarySourcePowerW: number;
  costItem: ApiCostComparisonItem | null;
}

export interface ApiCalculationResults {
  equipmentBudgetRows: ApiEquipmentBudgetRow[];
  totals: {
    totalWhPerDay: number;
    totalAhPerDay: number;
    totalWhPerWeek: number;
    totalAhPerWeek: number;
  };
  battery: {
    inputMode: string;
    inputValue: number;
    capacityAh: number;
    autonomyDays: number;
  };
  selectedSource: "Brenselcelle" | "Dieselaggregat" | "Ikkje berekna";
  annualEnergyDeficitKWh: number;
  monthlyEnergyBalance: ApiMonthlyEnergyBalanceRow[];
  annualTotals: ApiAnnualTotals;
  costComparison: {
    annualEnergyDeficitKWh: number;
    alternatives: ApiCostComparisonItem[];
  };
  scenarios: {
    fuelCell: ApiReserveScenario;
    diesel: ApiReserveScenario;
  };
}

export function normalizeCalculationRequest(raw: unknown): unknown;
export function validateCalculationRequest(configuration: unknown): Record<string, string>;
export function calculateEquipmentBudgetRows(equipmentRows: unknown[], nominalVoltageValue: ApiEditableNumber): ApiEquipmentBudgetRow[];
export function calculateNumericResults(configuration: unknown): ApiCalculationResults;
