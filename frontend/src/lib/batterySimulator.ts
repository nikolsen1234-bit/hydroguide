/**
 * Hourly battery simulation engine for off-grid solar+battery systems.
 *
 * Simulates a full year (8760+ hours) of battery charge/discharge cycles
 * and computes reliability KPIs for off-grid hydropower intakes.
 */

import { MONTH_KEYS } from "../constants";
import type { MonthKey, MonthlyReliability, ReliabilityMetrics, WorstPeriod } from "../types";

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export interface BatterySimInput {
  /** Hourly GTI on tilted plane (W/m²) */
  hourlyGtiWm2: Float64Array;
  /** Hourly PV efficiency factor (Huld model, ~1.0) */
  hourlyEfficiency: Float64Array;
  /** Number of panels */
  panelCount: number;
  /** Panel peak power (Wp) */
  panelPowerWp: number;
  /** System efficiency (0-1, e.g. 0.80) */
  systemEfficiency: number;
  /** Battery nominal capacity (Wh) = voltage × Ah */
  batteryCapacityWh: number;
  /** Max depth of discharge (0-1, e.g. 0.8) */
  maxDepthOfDischarge: number;
  /** Constant hourly load (Wh) = totalWhPerDay / 24 */
  loadWhPerHour: number;
  /** Number of hours in simulation */
  numHours: number;
  /** Year used (for date labeling) */
  year: number;
  /** Whether a backup source (fuel cell / diesel) is available */
  hasBackupSource: boolean;
  /** Backup source power output (W) — max it can deliver per hour */
  backupPowerW: number;
  /** Backup fuel consumption per kWh generated */
  backupFuelPerKWh: number;
}

export interface BatterySimResult {
  /** SOC at end of each hour (Wh) */
  socWh: Float64Array;
  /** Hourly solar production (Wh) */
  solarWh: Float64Array;
  /** Hourly energy deficit — load not met even after backup (Wh) */
  deficitWh: Float64Array;
  /** Hourly energy curtailed — battery full (Wh) */
  curtailedWh: Float64Array;
  /** Hourly backup source energy delivered (Wh) */
  backupWh: Float64Array;
  /** Hourly backup fuel consumed (litres) */
  backupFuelL: Float64Array;
}

/**
 * Run hour-by-hour battery state machine for a full year.
 */
export function simulateBattery(input: BatterySimInput): BatterySimResult {
  const {
    hourlyGtiWm2, hourlyEfficiency, panelCount, panelPowerWp,
    systemEfficiency, batteryCapacityWh, maxDepthOfDischarge,
    loadWhPerHour, numHours,
    hasBackupSource, backupPowerW, backupFuelPerKWh,
  } = input;

  const minSocWh = batteryCapacityWh * (1 - maxDepthOfDischarge);
  const backupMaxWh = hasBackupSource ? backupPowerW : 0; // max Wh per hour (W × 1h)

  const socWh = new Float64Array(numHours);
  const solarWh = new Float64Array(numHours);
  const deficitWh = new Float64Array(numHours);
  const curtailedWh = new Float64Array(numHours);
  const backupWh = new Float64Array(numHours);
  const backupFuelL = new Float64Array(numHours);

  // Start fully charged
  let soc = batteryCapacityWh;

  for (let i = 0; i < numHours; i++) {
    const eff = hourlyEfficiency[i] > 0 ? hourlyEfficiency[i] : 1;
    const solar = (hourlyGtiWm2[i] / 1000) * panelPowerWp * panelCount * eff * systemEfficiency;
    solarWh[i] = solar;

    const net = solar - loadWhPerHour;

    if (net >= 0) {
      // Surplus — charge battery
      const newSoc = Math.min(soc + net, batteryCapacityWh);
      curtailedWh[i] = (soc + net) - newSoc;
      soc = newSoc;
    } else {
      // Deficit — discharge battery, then backup
      const needed = -net;
      const available = soc - minSocWh;
      if (available >= needed) {
        soc -= needed;
      } else {
        // Battery can't cover it all
        const shortfall = needed - Math.max(0, available);
        soc = minSocWh;

        if (hasBackupSource && backupMaxWh > 0) {
          // Backup kicks in
          const backupDelivered = Math.min(shortfall, backupMaxWh);
          backupWh[i] = backupDelivered;
          backupFuelL[i] = (backupDelivered / 1000) * backupFuelPerKWh;
          const remainingDeficit = shortfall - backupDelivered;
          if (remainingDeficit > 0) {
            deficitWh[i] = remainingDeficit;
          }
          // Backup also charges battery with any remaining capacity
          const backupSurplus = backupMaxWh - backupDelivered;
          if (backupSurplus > 0) {
            const chargeRoom = batteryCapacityWh - soc;
            const charge = Math.min(backupSurplus, chargeRoom);
            soc += charge;
            backupWh[i] += charge;
            backupFuelL[i] += (charge / 1000) * backupFuelPerKWh;
          }
        } else {
          deficitWh[i] = shortfall;
        }
      }
    }

    socWh[i] = soc;
  }

  return { socWh, solarWh, deficitWh, curtailedWh, backupWh, backupFuelL };
}

// ---------------------------------------------------------------------------
// KPI computation
// ---------------------------------------------------------------------------

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function monthLabel(dayOfYear: number): string {
  let d = dayOfYear;
  for (let m = 0; m < 12; m++) {
    if (d <= DAYS_IN_MONTH[m]) return `${d}. ${MONTH_KEYS[m]}`;
    d -= DAYS_IN_MONTH[m];
  }
  return `${dayOfYear}`;
}

/**
 * Compute all reliability KPIs from a completed simulation.
 */
export function computeReliabilityMetrics(
  sim: BatterySimResult,
  batteryCapacityWh: number,
  maxDoD: number,
  loadWhPerHour: number,
): ReliabilityMetrics {
  const { socWh, solarWh, deficitWh } = sim;
  const n = socWh.length;
  const minSocWh = batteryCapacityWh * (1 - maxDoD);
  const lowSocThreshold = batteryCapacityWh * 0.20; // 20% of total capacity

  // ---- Monthly aggregation ----
  const monthly: MonthlyReliability[] = [];
  let hourOffset = 0;

  for (let m = 0; m < 12; m++) {
    const days = DAYS_IN_MONTH[m];
    const hoursInMonth = days * 24;
    let fullDays = 0;
    let emptyDays = 0;
    let lowSocHours = 0;
    let monthDeficitWh = 0;
    let monthDeficitHours = 0;
    let monthSolarWh = 0;
    let monthLoadWh = 0;

    for (let d = 0; d < days; d++) {
      let dayHadFull = false;
      let dayHadEmpty = false;
      for (let h = 0; h < 24; h++) {
        const idx = hourOffset + d * 24 + h;
        if (idx >= n) break;
        if (socWh[idx] >= batteryCapacityWh * 0.995) dayHadFull = true;
        if (socWh[idx] <= minSocWh * 1.005) dayHadEmpty = true;
        if (socWh[idx] < lowSocThreshold) lowSocHours++;
        if (deficitWh[idx] > 0) { monthDeficitWh += deficitWh[idx]; monthDeficitHours++; }
        monthSolarWh += solarWh[idx];
      }
      if (dayHadFull) fullDays++;
      if (dayHadEmpty) emptyDays++;
    }

    monthLoadWh = loadWhPerHour * hoursInMonth;

    monthly.push({
      month: MONTH_KEYS[m] as MonthKey,
      batteryFullPct: (fullDays / days) * 100,
      batteryEmptyPct: (emptyDays / days) * 100,
      hoursBelow20Pct: lowSocHours,
      deficitWh: monthDeficitWh,
      deficitHours: monthDeficitHours,
      solarProductionWh: monthSolarWh,
      loadDemandWh: monthLoadWh,
    });

    hourOffset += hoursInMonth;
  }

  // ---- Total LOLH ----
  let lolh = 0;
  let totalDeficit = 0;
  for (let i = 0; i < n; i++) {
    if (deficitWh[i] > 0) { lolh++; totalDeficit += deficitWh[i]; }
  }

  // ---- Longest consecutive low-SOC period ----
  let longestLow = 0;
  let currentLow = 0;
  for (let i = 0; i < n; i++) {
    if (socWh[i] <= minSocWh * 1.005) {
      currentLow++;
      if (currentLow > longestLow) longestLow = currentLow;
    } else {
      currentLow = 0;
    }
  }

  // ---- Worst 7-day and 30-day periods (sliding window over deficit) ----
  function worstWindow(windowHours: number): WorstPeriod {
    if (n < windowHours) return { startHour: 0, deficitWh: 0, label: "" };
    let sum = 0;
    for (let i = 0; i < windowHours; i++) sum += deficitWh[i];
    let maxSum = sum;
    let maxStart = 0;
    for (let i = windowHours; i < n; i++) {
      sum += deficitWh[i] - deficitWh[i - windowHours];
      if (sum > maxSum) { maxSum = sum; maxStart = i - windowHours + 1; }
    }
    const doy = Math.floor(maxStart / 24) + 1;
    return { startHour: maxStart, deficitWh: maxSum, label: monthLabel(doy) };
  }

  const worst7Day = worstWindow(7 * 24);
  const worst30Day = worstWindow(30 * 24);

  // ---- Worst month ----
  let worstMonthIdx = 0;
  let worstMonthDeficit = 0;
  for (let m = 0; m < 12; m++) {
    if (monthly[m].deficitWh > worstMonthDeficit) {
      worstMonthDeficit = monthly[m].deficitWh;
      worstMonthIdx = m;
    }
  }

  // ---- SOC histogram (10 bins: 0-10%, 10-20%, ..., 90-100%) ----
  const socHistogram = new Array<number>(10).fill(0);
  for (let i = 0; i < n; i++) {
    const frac = batteryCapacityWh > 0 ? socWh[i] / batteryCapacityWh : 0;
    const bin = Math.min(9, Math.floor(frac * 10));
    socHistogram[bin]++;
  }
  // Convert to fractions
  for (let b = 0; b < 10; b++) {
    socHistogram[b] = n > 0 ? socHistogram[b] / n : 0;
  }

  return {
    monthly,
    lolh,
    totalDeficitWh: totalDeficit,
    longestLowSocHours: longestLow,
    worst7Day,
    worst30Day,
    worstMonthIndex: worstMonthIdx,
    socHistogram,
  };
}
