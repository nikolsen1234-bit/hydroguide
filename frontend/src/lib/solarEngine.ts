/**
 * Solar irradiance calculation engine.
 *
 * Direct port of PVGIS 6.0 (EUPL-1.2) algorithms to TypeScript (client-side).
 *
 * Pipeline (same as PVGIS api/power/broadband.py):
 *   1. Solar position (NOAA)
 *   2. Solar incidence (Iqbal 1983)
 *   3. Horizon shading
 *   4. Direct inclined irradiance (Hofierka 2002)
 *   5. Diffuse inclined irradiance (Muneer 1990)
 *   6. Ground-reflected irradiance
 *   7. Reflectivity / AOI losses (Martin & Ruiz 2005)
 *   8. Module temperature (Faiman 2008)
 *   9. PV efficiency (Huld et al. 2011)
 */

const PI = Math.PI;
const TWO_PI = 2 * PI;
const DEG2RAD = PI / 180;
const RAD2DEG = 180 / PI;

export const SOLAR_CONSTANT = 1360.8;
export const ECCENTRICITY_AMPLITUDE = 0.03344;
export const ECCENTRICITY_PHASE_OFFSET = 0.048869;
export const ALBEDO_DEFAULT = 0.2;
export const ANGULAR_LOSS_COEFFICIENT = 0.155;
export const TERM_N_IN_SHADE = 0.25227;
export const FLAT_PANEL_THRESHOLD = 0.0001;

export const HULD_CSI = {
  k: [1.000436, -0.012678, -0.017522, -0.003154, -0.000315, -0.000164, 0.0],
  U0: 26.9,
  U1: 6.2,
};

// ---------------------------------------------------------------------------
// 1. NOAA Solar Position
// ---------------------------------------------------------------------------

export function fractionalYear(dayOfYear: number, hour: number, daysInYear: number): number {
  return TWO_PI / daysInYear * (dayOfYear - 1 + (hour - 12) / 24);
}

export function solarDeclination(gamma: number): number {
  return (
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)
  );
}

export function equationOfTime(gamma: number): number {
  return 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
}

export function timeOffset(eqTimeMinutes: number, longitudeDeg: number, timezoneHours: number): number {
  return eqTimeMinutes + 4 * longitudeDeg - 60 * timezoneHours;
}

export function trueSolarTime(hour: number, minute: number, offsetMinutes: number): number {
  const secondsSinceMidnight = hour * 3600 + minute * 60;
  return ((secondsSinceMidnight + offsetMinutes * 60) / 60) % 1440;
}

export function solarHourAngle(trueSolarTimeMinutes: number): number {
  return (trueSolarTimeMinutes - 720.0) * (PI / 720.0);
}

export function solarZenith(latRad: number, declRad: number, hourAngleRad: number): number {
  const cosZ = Math.sin(latRad) * Math.sin(declRad)
    + Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad);
  return Math.acos(Math.max(-1, Math.min(1, cosZ)));
}

export function solarAltitude(zenithRad: number): number {
  return PI / 2 - zenithRad;
}

export function solarAzimuth(latRad: number, declRad: number, zenithRad: number, hourAngleRad: number): number {
  const sinZ = Math.sin(zenithRad);
  if (sinZ === 0) return 0;
  const cosAz = (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(declRad))
    / (Math.cos(latRad) * sinZ);
  const az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  return hourAngleRad > 0
    ? (PI + az) % TWO_PI
    : (3 * PI - az) % TWO_PI;
}

export function atmosphericRefractionAdjustment(altitudeRad: number): number {
  const altDeg = altitudeRad * RAD2DEG;
  const tanAlt = Math.tan(altitudeRad);
  let adjDeg: number;
  if (altDeg > 5) {
    adjDeg = (58.1 / tanAlt - 0.07 / (tanAlt ** 3) + 0.000086 / (tanAlt ** 5)) / 3600;
  } else if (altDeg > -0.575) {
    adjDeg = (1735 + altDeg * (-518.2 + altDeg * (103.4 + altDeg * (-12.79 + altDeg * 0.711)))) / 3600;
  } else {
    adjDeg = (-20.774 / tanAlt) / 3600;
  }
  return adjDeg * DEG2RAD;
}

// ---------------------------------------------------------------------------
// 2. Solar Incidence (Iqbal 1983)
// ---------------------------------------------------------------------------

export function solarIncidence(zenithRad: number, azimuthNorthRad: number, tiltRad: number, orientationNorthRad: number): number {
  const azSouth = azimuthNorthRad - PI;
  const oriSouth = orientationNorthRad - PI;
  const fraction = azSouth / TWO_PI;
  const limited = azSouth >= 0
    ? TWO_PI * (fraction - Math.floor(fraction))
    : TWO_PI - TWO_PI * Math.abs(fraction - Math.ceil(fraction));

  const cosI = Math.cos(zenithRad) * Math.cos(tiltRad)
    + Math.sin(tiltRad) * Math.sin(zenithRad) * Math.cos(limited - oriSouth);
  const incidence = Math.acos(Math.max(-1, Math.min(1, cosI)));
  return Math.max(0, PI / 2 - incidence);
}

// ---------------------------------------------------------------------------
// 3. Extraterrestrial Irradiance (Hofierka 2002)
// ---------------------------------------------------------------------------

export function extraterrestrialNormal(dayOfYear: number, daysInYear: number): number {
  const dayAngle = TWO_PI * dayOfYear / daysInYear;
  const distCorr = 1 + ECCENTRICITY_AMPLITUDE * Math.cos(dayAngle - ECCENTRICITY_PHASE_OFFSET);
  return SOLAR_CONSTANT * distCorr;
}

// ---------------------------------------------------------------------------
// 4. Muneer Diffuse Model
// ---------------------------------------------------------------------------

export function termN(kb: number): number {
  return 0.00263 - 0.712 * kb - 0.6883 * kb * kb;
}

export function diffuseSkyIrradiance(tiltRad: number, n: number): number {
  return (1 + Math.cos(tiltRad)) / 2
    + (Math.sin(tiltRad) - tiltRad * Math.cos(tiltRad) - PI * Math.sin(tiltRad / 2) ** 2) * n;
}

export function diffuseInclinedSunlit(diffuseHoriz: number, skyIrrad: number, kb: number, incidenceRad: number, altitudeRad: number): number {
  const sinAlt = Math.sin(altitudeRad);
  if (sinAlt < 0.001) return diffuseHoriz * skyIrrad;
  return diffuseHoriz * (
    skyIrrad * (1 - kb) + kb * Math.sin(incidenceRad) / sinAlt
  );
}

export function diffuseInclinedShade(diffuseHoriz: number, tiltRad: number): number {
  const skyIrrad = diffuseSkyIrradiance(tiltRad, TERM_N_IN_SHADE);
  return diffuseHoriz * skyIrrad;
}

// ---------------------------------------------------------------------------
// 5. Ground-Reflected (Hofierka 2002)
// ---------------------------------------------------------------------------

export function groundReflected(ghi: number, tiltRad: number, albedo = ALBEDO_DEFAULT): number {
  if (tiltRad <= FLAT_PANEL_THRESHOLD) return 0;
  return ghi * albedo * (1 - Math.cos(tiltRad)) / 2;
}

// ---------------------------------------------------------------------------
// 6. Martin & Ruiz Reflectivity / AOI Losses
// ---------------------------------------------------------------------------

export function directReflectivityFactor(typicalIncidenceRad: number, ar = ANGULAR_LOSS_COEFFICIENT): number {
  if (Math.abs(typicalIncidenceRad) >= PI / 2) return 0;
  const num = 1 - Math.exp(-Math.cos(typicalIncidenceRad) / ar);
  const den = 1 - Math.exp(-1 / ar);
  return num / den;
}

export function diffuseReflectivityFactor(tiltRad: number, ar = ANGULAR_LOSS_COEFFICIENT): number {
  const coeff = Math.sin(tiltRad) + (PI - tiltRad - Math.sin(tiltRad)) / (1 + Math.cos(tiltRad));
  const c1 = 4 / (3 * PI);
  const arProduct = ar / 2 - 0.154;
  return 1 - Math.exp(-(c1 * coeff + arProduct * ar * ar) / ar);
}

// ---------------------------------------------------------------------------
// 7. Faiman Module Temperature
// ---------------------------------------------------------------------------

export function moduleTemperature(ambientC: number, irradiance: number, windSpeed: number, U0 = HULD_CSI.U0, U1 = HULD_CSI.U1): number {
  return ambientC + irradiance / (U0 + U1 * windSpeed);
}

// ---------------------------------------------------------------------------
// 8. Huld PV Efficiency Factor
// ---------------------------------------------------------------------------

export function efficiencyFactor(irradiance: number, moduleTempC: number, k = HULD_CSI.k): number {
  const gPrime = irradiance * 0.001;
  if (gPrime <= 0) return 0;
  const tPrime = moduleTempC - 25;
  const logG = Math.log(gPrime);
  const eff = k[0]
    + logG * (k[1] + logG * k[2])
    + tPrime * (k[3] + logG * (k[4] + logG * k[5]) + k[6] * tPrime);
  return eff / k[0];
}

// ---------------------------------------------------------------------------
// 9. Horizon / Shading
// ---------------------------------------------------------------------------

export interface HorizonProfile {
  azimuths: Float64Array;
  heights: Float64Array;
}

export function interpolateHorizonHeight(horizonProfile: HorizonProfile, solarAzimuths: Float64Array): Float64Array {
  const { azimuths, heights } = horizonProfile;
  const n = azimuths.length;
  if (n === 0) return new Float64Array(solarAzimuths.length);

  let allZero = true;
  for (let i = 0; i < n; i++) { if (heights[i] !== 0) { allZero = false; break; } }
  if (allZero) return new Float64Array(solarAzimuths.length);

  const extAz = new Float64Array(n + 1);
  const extH = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { extAz[i] = azimuths[i]; extH[i] = heights[i]; }
  extAz[n] = TWO_PI;
  extH[n] = heights[0];

  const result = new Float64Array(solarAzimuths.length);
  for (let j = 0; j < solarAzimuths.length; j++) {
    let az = solarAzimuths[j] % TWO_PI;
    if (az < 0) az += TWO_PI;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (extAz[mid] <= az) lo = mid + 1; else hi = mid;
    }
    const i1 = lo - 1;
    const i2 = lo;
    if (i1 < 0 || i2 > n) { result[j] = extH[0]; continue; }
    const span = extAz[i2] - extAz[i1];
    const t = span > 0 ? (az - extAz[i1]) / span : 0;
    result[j] = extH[i1] + t * (extH[i2] - extH[i1]);
  }
  return result;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"] as const;

export interface IrradianceResult {
  months: Record<string, number>;
  meta: {
    algorithms: string[];
    source: string;
    constants: { SOLAR_CONSTANT: number; ALBEDO_DEFAULT: number; ANGULAR_LOSS_COEFFICIENT: number };
  };
}

// ---------------------------------------------------------------------------
// 10. Hourly irradiance for a full year (battery simulation input)
// ---------------------------------------------------------------------------

export interface HourlyIrradianceResult {
  /** Global tilted irradiance per hour (W/m²) */
  gtiWm2: Float64Array;
  /** Module temperature per hour (°C) */
  moduleTempC: Float64Array;
  /** PV efficiency factor per hour (Huld model, ~1.0) */
  efficiency: Float64Array;
  /** Number of hours */
  length: number;
}

function fallbackMonthIndex(hourIndex: number): number {
  let remainingHours = hourIndex;
  for (let month = 0; month < DAYS_IN_MONTH.length; month++) {
    const hoursInMonth = DAYS_IN_MONTH[month] * 24;
    if (remainingHours < hoursInMonth) return month;
    remainingHours -= hoursInMonth;
  }
  return DAYS_IN_MONTH.length - 1;
}

/**
 * Returns UTC offset (1 = CET, 2 = CEST) for Norway for a given day-of-year.
 * DST: last Sunday of March → last Sunday of October (Europe/Oslo rule).
 */
function norwayUtcOffset(year: number, dayOfYear: number): number {
  // Find day-of-year for last Sunday of March and last Sunday of October
  function lastSundayDOY(month: number): number {
    // Day-of-year of the last day of the given month (1-based month)
    let doy = 0;
    const dims = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let i = 0; i < month; i++) doy += dims[i];
    // weekday of last day: Jan 1 weekday via Zeller-ish calculation
    const jan1Weekday = new Date(year, 0, 1).getDay(); // 0=Sun
    const lastDayWeekday = (jan1Weekday + doy - 1) % 7;
    return doy - lastDayWeekday; // last Sunday (0=Sun)
  }
  const dstStart = lastSundayDOY(2); // last Sunday of March (month index 2)
  const dstEnd = lastSundayDOY(9);   // last Sunday of October (month index 9)
  return dayOfYear >= dstStart && dayOfYear < dstEnd ? 2 : 1;
}

/**
 * Compute hourly tilted irradiance for every hour in a year.
 * Uses the PVGIS 6.0 pipeline applied per actual hour with real climate data
 * from `fetchHourlyClimateYear()` in `metClient.ts`.
 */
export function hourlyIrradianceForYear({
  latDeg,
  lonDeg,
  tiltDeg,
  orientDeg,
  hourlyGhi,
  hourlyDhi,
  hourlyTemp,
  hourlyWind,
  numHours,
  year,
  utcDayOfYear,
  utcHour,
  horizonProfile = null,
  albedo = ALBEDO_DEFAULT,
}: {
  latDeg: number;
  lonDeg: number;
  tiltDeg: number;
  orientDeg: number;
  hourlyGhi: Float64Array;
  hourlyDhi: Float64Array;
  hourlyTemp: Float64Array;
  hourlyWind: Float64Array;
  numHours: number;
  year: number;
  utcDayOfYear?: Uint16Array;
  utcHour?: Uint8Array;
  horizonProfile?: HorizonProfile | null;
  albedo?: number;
}): HourlyIrradianceResult {
  const latRad = latDeg * DEG2RAD;
  const tiltRad = tiltDeg * DEG2RAD;
  const orientRad = orientDeg * DEG2RAD;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;

  const gtiWm2 = new Float64Array(numHours);
  const moduleTempC = new Float64Array(numHours);
  const efficiency = new Float64Array(numHours);

  // Pre-build horizon lookup table (360 bins, 1° resolution) to avoid per-hour allocation
  let horizonLookup: Float64Array | null = null;
  if (horizonProfile && horizonProfile.heights.length > 0) {
    horizonLookup = new Float64Array(360);
    for (let deg = 0; deg < 360; deg++) {
      const hh = interpolateHorizonHeight(horizonProfile, new Float64Array([deg * DEG2RAD]));
      horizonLookup[deg] = hh[0];
    }
  }

  for (let i = 0; i < numHours; i++) {
    const dayOfYear = utcDayOfYear?.[i] ?? (Math.floor(i / 24) + 1);
    const hour = utcHour?.[i] ?? (i % 24);

    const ghiVal = hourlyGhi[i];
    const dhiVal = hourlyDhi[i];
    const tempVal = hourlyTemp[i];
    const windVal = hourlyWind[i];

    // Skip nighttime (no solar input)
    if (ghiVal <= 0) {
      moduleTempC[i] = tempVal;
      continue;
    }

    // 1. Solar position (NOAA)
    const gamma = fractionalYear(dayOfYear, hour, daysInYear);
    const decl = solarDeclination(gamma);
    const eqTime = equationOfTime(gamma);
    const offset = timeOffset(eqTime, lonDeg, utcDayOfYear && utcHour ? 0 : norwayUtcOffset(year, dayOfYear));
    const tst = trueSolarTime(hour, 0, offset);
    const ha = solarHourAngle(tst);
    const zenith = solarZenith(latRad, decl, ha);
    const alt = solarAltitude(zenith);

    if (alt <= 0) {
      moduleTempC[i] = tempVal;
      continue;
    }

    const az = solarAzimuth(latRad, decl, zenith, ha);
    const refrAdj = atmosphericRefractionAdjustment(alt);
    const altAdj = alt + refrAdj;
    const zenithAdj = PI / 2 - altAdj;

    // 2. Solar incidence (Iqbal)
    const incidence = solarIncidence(zenithAdj, az, tiltRad, orientRad);

    // 3. Horizon shading (fast lookup)
    let inShade = false;
    if (horizonLookup) {
      const azDeg = Math.round(az * RAD2DEG) % 360;
      inShade = altAdj < horizonLookup[azDeg < 0 ? azDeg + 360 : azDeg];
    }

    // 4. Extraterrestrial
    const G0 = extraterrestrialNormal(dayOfYear, daysInYear);
    const G0h = G0 * Math.sin(altAdj);

    const directH = Math.max(0, ghiVal - dhiVal);

    // 5. kb ratio
    const kb = G0h > 0 ? Math.min(1, directH / G0h) : 0;

    // 6. Direct inclined
    let directInc = 0;
    if (!inShade && incidence > 0 && altAdj > 0) {
      directInc = directH * Math.sin(incidence) / Math.sin(altAdj);
      directInc *= directReflectivityFactor(PI / 2 - incidence);
    }

    // 7. Diffuse inclined (Muneer)
    let diffuseInc: number;
    if (inShade || altAdj < 0.1) {
      diffuseInc = diffuseInclinedShade(dhiVal, tiltRad);
    } else {
      const n = termN(kb);
      const skyIrrad = diffuseSkyIrradiance(tiltRad, n);
      diffuseInc = diffuseInclinedSunlit(dhiVal, skyIrrad, kb, incidence, altAdj);
    }
    diffuseInc *= diffuseReflectivityFactor(tiltRad);

    // 8. Ground-reflected
    let grRefl = groundReflected(ghiVal, tiltRad, albedo);
    grRefl *= diffuseReflectivityFactor(tiltRad);

    // 9. Global tilted irradiance
    const globalInc = Math.max(0, directInc) + Math.max(0, diffuseInc) + Math.max(0, grRefl);
    gtiWm2[i] = globalInc;

    // 10. Module temperature (Faiman) and efficiency (Huld)
    const modTemp = moduleTemperature(tempVal, globalInc, windVal);
    moduleTempC[i] = modTemp;
    efficiency[i] = globalInc > 0 ? efficiencyFactor(globalInc, modTemp) : 0;
  }

  return { gtiWm2, moduleTempC, efficiency, length: numHours };
}

export function monthlyIrradianceFromHourlyYear({
  latDeg,
  lonDeg,
  tiltDeg,
  orientDeg,
  hourlyGhi,
  hourlyDhi,
  hourlyTemp,
  hourlyWind,
  numHours,
  year,
  utcDayOfYear,
  utcHour,
  utcMonthIndex,
  horizonProfile = null,
  albedo = ALBEDO_DEFAULT,
}: {
  latDeg: number;
  lonDeg: number;
  tiltDeg: number;
  orientDeg: number;
  hourlyGhi: Float64Array;
  hourlyDhi: Float64Array;
  hourlyTemp: Float64Array;
  hourlyWind: Float64Array;
  numHours: number;
  year: number;
  utcDayOfYear?: Uint16Array;
  utcHour?: Uint8Array;
  utcMonthIndex?: Uint8Array;
  horizonProfile?: HorizonProfile | null;
  albedo?: number;
}): IrradianceResult {
  const irradiance = hourlyIrradianceForYear({
    latDeg,
    lonDeg,
    tiltDeg,
    orientDeg,
    hourlyGhi,
    hourlyDhi,
    hourlyTemp,
    hourlyWind,
    numHours,
    year,
    utcDayOfYear,
    utcHour,
    horizonProfile,
    albedo,
  });

  const months: Record<string, number> = {};
  for (let month = 0; month < MONTH_KEYS.length; month++) {
    months[MONTH_KEYS[month]] = 0;
  }

  for (let i = 0; i < irradiance.length; i++) {
    const monthIndex = utcMonthIndex?.[i] ?? fallbackMonthIndex(i);
    months[MONTH_KEYS[monthIndex]] += (irradiance.gtiWm2[i] * irradiance.efficiency[i]) / 1000;
  }

  for (let month = 0; month < MONTH_KEYS.length; month++) {
    const key = MONTH_KEYS[month];
    months[key] = Math.round(months[key] * 100) / 100;
  }

  return {
    months,
    meta: {
      algorithms: [
        "NOAA solar position",
        "Iqbal 1983 incidence",
        "Hofierka 2002 direct",
        "Muneer 1990 diffuse",
        "Martin & Ruiz 2005 AOI",
        "Faiman 2008 temperature",
        "Huld 2011 efficiency",
      ],
      source: "PVGIS 6.0 hourly algorithms (EUPL-1.2)",
      constants: { SOLAR_CONSTANT, ALBEDO_DEFAULT: albedo, ANGULAR_LOSS_COEFFICIENT },
    },
  };
}
