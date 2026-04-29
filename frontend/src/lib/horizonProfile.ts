/**
 * Horizon profile generation using Kartverket 1m DTM.
 *
 * Calls Kartverket's elevation API directly from the browser (CORS-enabled).
 * Generates a horizon profile matching PVGIS 6.0 format.
 */

import type { HorizonProfile } from "./solarEngine";

const KARTVERKET_URL = "https://ws.geonorge.no/hoydedata/v1/punkt";
const COORD_SYSTEM = "4258"; // ETRS89 geographic (lat/lon)
const MAX_POINTS_PER_REQUEST = 50;
const DEG2RAD = Math.PI / 180;

const NUM_DIRECTIONS = 360;
const DIRECTION_INTERVAL_DEG = 360 / NUM_DIRECTIONS;
const SAMPLE_DISTANCES = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 75,
  90, 110, 130, 150, 175, 200, 230, 260, 300, 350,
  400, 450, 500, 575, 650, 750, 850, 1000, 1150, 1300,
  1500, 1750, 2000, 2300, 2700, 3100, 3600, 4200, 5000, 6000,
];

function metersToDegreeDelta(distanceM: number, azimuthRad: number, latDeg: number) {
  const cosLat = Math.cos(latDeg * DEG2RAD);
  const dLat = (distanceM * Math.cos(azimuthRad)) / 111320;
  const dLon = (distanceM * Math.sin(azimuthRad)) / (111320 * cosLat);
  return { dLat, dLon };
}

function buildSamplePoints(lat: number, lon: number) {
  const points: [number, number][] = [];
  const directionMap: { dirIndex: number; sampleIndex: number }[] = [];

  points.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
  directionMap.push({ dirIndex: -1, sampleIndex: -1 });

  for (let d = 0; d < NUM_DIRECTIONS; d++) {
    const azDeg = d * DIRECTION_INTERVAL_DEG;
    const azRad = azDeg * DEG2RAD;
    for (let s = 0; s < SAMPLE_DISTANCES.length; s++) {
      const dist = SAMPLE_DISTANCES[s];
      const { dLat, dLon } = metersToDegreeDelta(dist, azRad, lat);
      points.push([
        Number((lon + dLon).toFixed(6)),
        Number((lat + dLat).toFixed(6)),
      ]);
      directionMap.push({ dirIndex: d, sampleIndex: s });
    }
  }

  return { points, directionMap };
}

async function fetchElevations(points: [number, number][]): Promise<number[]> {
  const chunks: [number, number][][] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS_PER_REQUEST) {
    chunks.push(points.slice(i, i + MAX_POINTS_PER_REQUEST));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const url = new URL(KARTVERKET_URL);
      url.searchParams.set("koordsys", COORD_SYSTEM);
      url.searchParams.set("datakilde", "dtm1");
      url.searchParams.set("punkter", JSON.stringify(chunk));

      const res = await fetch(url.toString(), {
        headers: { accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Kartverket returned ${res.status}`);

      const data = await res.json();
      const pts: { z?: number; height?: number }[] = Array.isArray(data?.punkter)
        ? data.punkter
        : Array.isArray(data?.points)
          ? data.points
          : Array.isArray(data)
            ? data
            : [];

      return pts.map((p) => p?.z ?? p?.height ?? 0);
    })
  );

  return results.flat();
}

/**
 * Generate a horizon profile for a given location using Kartverket 1m DTM.
 *
 * @param heightOffset  Height above ground in meters (e.g. panel on a dam wall or tower).
 *                      Raises the observation point, reducing visible horizon angles.
 * @returns { azimuths: Float64Array (radians), heights: Float64Array (radians) }
 */
export async function generateHorizonProfile(lat: number, lon: number, heightOffset = 0): Promise<HorizonProfile> {
  const { points, directionMap } = buildSamplePoints(lat, lon);

  let elevations: number[];
  try {
    elevations = await fetchElevations(points);
  } catch {
    // Fallback: flat terrain (all zeros)
    return {
      azimuths: new Float64Array(NUM_DIRECTIONS).map((_, i) => i * DIRECTION_INTERVAL_DEG * DEG2RAD),
      heights: new Float64Array(NUM_DIRECTIONS),
    };
  }

  const originElevation = elevations[0] + heightOffset;
  const maxAngles = new Float64Array(NUM_DIRECTIONS);

  for (let i = 1; i < directionMap.length; i++) {
    const { dirIndex, sampleIndex } = directionMap[i];
    if (dirIndex < 0) continue;

    const elev = elevations[i];
    const dH = elev - originElevation; // negative when panel is above surrounding terrain
    const dist = SAMPLE_DISTANCES[sampleIndex];
    const angle = Math.atan2(dH, dist);

    if (angle > maxAngles[dirIndex]) {
      maxAngles[dirIndex] = angle;
    }
  }

  for (let d = 0; d < NUM_DIRECTIONS; d++) {
    if (maxAngles[d] < 0) maxAngles[d] = 0;
  }

  const azimuths = new Float64Array(NUM_DIRECTIONS);
  for (let d = 0; d < NUM_DIRECTIONS; d++) {
    azimuths[d] = d * DIRECTION_INTERVAL_DEG * DEG2RAD;
  }

  return { azimuths, heights: maxAngles };
}
