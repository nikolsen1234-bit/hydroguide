import type {
  KFactorKey,
  Polarization,
  RadioLinkConfiguration,
  RadioLinkEndpointConfiguration
} from "../types";

export type RadioLinkEndpointInput = RadioLinkEndpointConfiguration;
export type RadioLinkFormState = RadioLinkConfiguration;

export interface RadioLinkPoint {
  lat: number;
  lng: number;
}

export interface RadioLinkSeries {
  terrain: number[];
  earthCurve: number[];
  lineOfSight: number[];
  fresnelLower: number[];
  fresnelUpper: number[];
}

export interface RadioLinkAnalysis {
  pointA: RadioLinkPoint;
  pointB: RadioLinkPoint;
  frequencyMHz: number;
  kFactor: KFactorKey;
  fresnelFactor: number;
  polarization: Polarization;
  rainFactor: number;
  terrainDistanceKm: number;
  linkDistanceKm: number;
  freeSpaceLossDb: number;
  rainAttenuationDb: number;
  azimuthA: number;
  azimuthB: number;
  elevationA: number;
  elevationB: number;
  startAltitudeM: number;
  endAltitudeM: number;
  lineClearanceM: number;
  fresnelClearanceM: number;
  distanceTicksKm: number[];
  series: RadioLinkSeries;
}

interface TerrainProfileResponse {
  heights?: Array<{ height?: number }>;
}

const EARTH_RADIUS_M = 6_375_000;
const DEGREE_RADIUS_M = 8_500_000;
const SPEED_OF_LIGHT_IN_AIR = 299_705;
const MAX_TERRAIN_SAMPLES = 200;

export function parseCoordinateInput(input: string): RadioLinkPoint | null {
  const cleaned = input.trim().replace(/[()]/g, " ");
  if (!cleaned) {
    return null;
  }

  const numericParts = cleaned.match(/-?\d+(?:[.,]\d+)?/g);
  if (!numericParts || numericParts.length !== 2) {
    return null;
  }

  const lat = toFiniteNumber(numericParts[0]);
  const lng = toFiniteNumber(numericParts[1]);

  if (lat === null || lng === null) {
    return null;
  }

  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  return {
    lat,
    lng
  };
}

export function clampFresnelFactor(value: number) {
  return Math.min(3, Math.max(0.6, value));
}

function getKFactorValue(key: KFactorKey) {
  if (key === "1") {
    return 1;
  }

  if (key === "2/3") {
    return 2 / 3;
  }

  if (key === "-2/3") {
    return -2 / 3;
  }

  return 4 / 3;
}

export async function runRadioLinkAnalysis(input: RadioLinkFormState): Promise<RadioLinkAnalysis> {
  const pointA = parseCoordinateInput(input.pointA.coordinate);
  const pointB = parseCoordinateInput(input.pointB.coordinate);
  const antennaHeightA = input.pointA.antennaHeight;
  const antennaHeightB = input.pointB.antennaHeight;

  if (!pointA || !pointB) {
    throw new Error("Koordinatene ma vere pa formatet X, Y.");
  }

  if (typeof antennaHeightA !== "number" || !Number.isFinite(antennaHeightA) || antennaHeightA < 0) {
    throw new Error("Antennehoyde for punkt A ma vere 0 eller meir.");
  }

  if (typeof antennaHeightB !== "number" || !Number.isFinite(antennaHeightB) || antennaHeightB < 0) {
    throw new Error("Antennehoyde for punkt B ma vere 0 eller meir.");
  }

  if (!Number.isFinite(input.frequencyMHz) || input.frequencyMHz <= 0) {
    throw new Error("Frekvens ma vere storre enn 0 MHz.");
  }

  if (!Number.isFinite(input.rainFactor) || input.rainFactor < 0) {
    throw new Error("Regnfaktor ma vere 0 eller meir.");
  }

  const terrainDistance = calculateDistance(pointA.lat, pointA.lng, pointB.lat, pointB.lng);

  if (!Number.isFinite(terrainDistance) || terrainDistance <= 0) {
    throw new Error("Punkta ma vere ulike for a berekne samband.");
  }

  const heights = await fetchTerrainProfile(pointA, pointB, terrainDistance);

  if (heights.length < 2) {
    throw new Error("Terrengprofilen returnerte for fa punkt.");
  }

  const startAltitude = input.pointA.heightScale === "AGL" ? heights[0] + antennaHeightA : antennaHeightA;
  const endAltitude =
    input.pointB.heightScale === "AGL"
      ? heights[heights.length - 1] + antennaHeightB
      : antennaHeightB;

  const linkDistance = Math.sqrt(Math.abs(startAltitude - endAltitude) ** 2 + terrainDistance ** 2);
  const azimuth = getAzimuth(pointA.lat, pointA.lng, pointB.lat, pointB.lng);
  const kFactorRadius = EARTH_RADIUS_M * getKFactorValue(input.kFactor);
  const earthCurve = getEarthCurve(kFactorRadius, heights.length, terrainDistance);
  const terrain = addArrays(heights, earthCurve);
  const lineOfSight = createLineOfSightList(startAltitude, endAltitude, heights.length);
  const waveLength = SPEED_OF_LIGHT_IN_AIR / (input.frequencyMHz * 1000);
  const fresnel = fresnelZone(terrainDistance, waveLength, heights.length, clampFresnelFactor(input.fresnelFactor));
  const fresnelLower = addArrays(lineOfSight, fresnel, -1);
  const fresnelUpper = addArrays(lineOfSight, fresnel);
  const degrees = calculateDegrees2(startAltitude, endAltitude, linkDistance, DEGREE_RADIUS_M);
  const rainAttenuation = getRainAttenuation(
    linkDistance / 1000,
    input.frequencyMHz,
    input.polarization === "horizontal",
    input.rainFactor
  );

  return {
    pointA,
    pointB,
    frequencyMHz: input.frequencyMHz,
    kFactor: input.kFactor,
    fresnelFactor: clampFresnelFactor(input.fresnelFactor),
    polarization: input.polarization,
    rainFactor: input.rainFactor,
    terrainDistanceKm: terrainDistance / 1000,
    linkDistanceKm: linkDistance / 1000,
    freeSpaceLossDb: 20 * (Math.log((4 * Math.PI * terrainDistance) / waveLength) / Math.LN10),
    rainAttenuationDb: Math.abs(rainAttenuation),
    azimuthA: azimuth[0],
    azimuthB: azimuth[1],
    elevationA: degrees[0],
    elevationB: degrees[1],
    startAltitudeM: startAltitude,
    endAltitudeM: endAltitude,
    lineClearanceM: getMinimumClearance(lineOfSight, terrain),
    fresnelClearanceM: getMinimumClearance(fresnelLower, terrain),
    distanceTicksKm: buildDistanceTicks(terrainDistance / 1000),
    series: {
      terrain,
      earthCurve,
      lineOfSight,
      fresnelLower,
      fresnelUpper
    }
  };
}

async function fetchTerrainProfile(pointA: RadioLinkPoint, pointB: RadioLinkPoint, distance: number) {
  const sampleCount = getSampleCount(distance);
  const response = await fetch("/api/terrain-profile", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      long1: pointA.lng,
      lat1: pointA.lat,
      long2: pointB.lng,
      lat2: pointB.lat,
      samples: sampleCount
    })
  });

  if (!response.ok) {
    throw new Error("Klarte ikkje a hente terrengprofil.");
  }

  const data = (await response.json()) as TerrainProfileResponse;
  const heights = data.heights
    ?.map((entry) => {
      if (typeof entry.height !== "number" || !Number.isFinite(entry.height)) {
        return undefined;
      }

      // The line-of-sight profile should follow the surface, not subsea bathymetry.
      return Math.max(0, entry.height);
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!heights?.length) {
    throw new Error("Terrengprofil manglar hoydepunkt.");
  }

  return heights;
}

function getSampleCount(_distance: number) {
  return MAX_TERRAIN_SAMPLES;
}

function toFiniteNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getMinimumClearance(reference: number[], terrain: number[]) {
  let minimum = Number.POSITIVE_INFINITY;

  for (let index = 0; index < reference.length; index += 1) {
    const clearance = reference[index] - terrain[index];
    if (clearance < minimum) {
      minimum = clearance;
    }
  }

  return minimum;
}

function buildDistanceTicks(distanceKm: number) {
  return [0, 0.25, 0.5, 0.75, 1].map((step) => Number((distanceKm * step).toFixed(2)));
}

function createLineOfSightList(height1: number, height2: number, numberOfPoints: number) {
  const step = (height2 - height1) / (numberOfPoints - 1);
  return Array.from({ length: numberOfPoints }, (_, i) =>
    i === numberOfPoints - 1 ? height2 : height1 + step * i
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function degToRad(valueInDegrees: number) {
  return (valueInDegrees * Math.PI) / 180;
}

function radToDeg(valueInRadians: number) {
  return (valueInRadians * 180) / Math.PI;
}

function getEarthCurve(radiusValue: number, numberOfPoints: number, distance: number) {
  const rKm = radiusValue / 1000;
  const totalRad = distance / radiusValue;
  const stepRad = totalRad / numberOfPoints;
  const baseLine = Math.cos(totalRad / 2) * rKm;
  const offset = Math.PI * 2 + totalRad / 2;

  return Array.from({ length: numberOfPoints }, (_, i) =>
    (Math.cos(offset - stepRad * i) * rKm - baseLine) * 1000
  );
}

function calculateDegrees2(heightStart: number, heightEnd: number, distance: number, radius: number) {
  const start = heightStart + radius;
  const end = heightEnd + radius;
  const acosA = clampCosineInput((start ** 2 + distance ** 2 - end ** 2) / (2 * start * distance));
  const acosB = clampCosineInput((end ** 2 + distance ** 2 - start ** 2) / (2 * end * distance));

  return [radToDeg(Math.acos(acosA)) - 90, radToDeg(Math.acos(acosB)) - 90];
}

function clampCosineInput(value: number) {
  return Math.min(1, Math.max(-1, value));
}

function getAzimuth(latA: number, lonA: number, latB: number, lonB: number) {
  let correctionFactorA = 0;
  let correctionFactorB = 0;

  if (latA < latB) {
    correctionFactorB = 540;
  } else if (latA > latB) {
    correctionFactorA = 540;
  }

  const lonRadA = degToRad(lonA);
  const lonRadB = degToRad(lonB);
  const latRadA = degToRad(latA);
  const latRadB = degToRad(latB);
  const lonDiff = lonRadB - lonRadA;
  const lonDiffReverse = lonRadA - lonRadB;
  const divisor1 = Math.cos(latRadA) * Math.tan(latRadB) - Math.sin(latRadA) * Math.cos(lonDiff);
  const divisor2 = Math.cos(latRadB) * Math.tan(latRadA) - Math.sin(latRadB) * Math.cos(lonDiffReverse);
  const alpha1 = Math.atan(Math.sin(lonDiff) / divisor1);
  const alpha2 = Math.atan(Math.sin(lonDiffReverse) / divisor2);

  return [normalizeAngle(radToDeg(alpha1) + correctionFactorA), normalizeAngle(radToDeg(alpha2) + correctionFactorB)];
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function fresnelZone(distance: number, waveLength: number, numberOfZones: number, factor: number) {
  const result: number[] = [];
  let d1 = 0;
  let d2 = distance;
  const stepLength = distance / (numberOfZones - 1);

  result[0] = 0;

  for (let index = 1; index < numberOfZones - 1; index += 1) {
    d1 += stepLength;
    d2 -= stepLength;
    result[index] = Math.sqrt((waveLength * d1 * d2) / (d1 + d2)) * factor;
  }

  result[numberOfZones - 1] = 0;

  return result;
}

function addArrays(a: number[], b: number[], sign: 1 | -1 = 1) {
  return a.map((v, i) => v + sign * b[i]);
}

function getRainAttenuation(distanceKm: number, frequencyGHz: number, horizontal: boolean, rainRate: number) {
  const f = getFactors(frequencyGHz);
  const sel = horizontal ? 1 : 3;
  const k = f[sel];
  const a = f[sel + 1];
  const dbPerKm = k * rainRate ** a;
  const rFactor = Math.min(2.5, 1 / (0.477 * distanceKm ** 0.633 * rainRate ** (0.073 * f[horizontal ? 2 : 4]) * frequencyGHz ** 0.123 - 10.579 * (1 - Math.exp(-0.024 * distanceKm))));
  return dbPerKm * rFactor * distanceKm;
}

const FREQUENCY_PARAMETERS = [
  [1, 0.0000259, 0.9691, 0.0000308, 0.8592],
  [1.5, 0.0000443, 1.0185, 0.0000574, 0.8957],
  [2, 0.0000847, 1.0664, 0.0000998, 0.949],
  [2.5, 0.0001321, 1.1209, 0.0001464, 1.0085],
  [3, 0.000139, 1.2322, 0.0001942, 1.0688],
  [3.5, 0.0001155, 1.4189, 0.0002346, 1.1387],
  [4, 0.0001071, 1.6009, 0.0002461, 1.2476],
  [4.5, 0.000134, 1.6948, 0.0002347, 1.3987],
  [5, 0.0002162, 1.6969, 0.0002428, 1.5317],
  [5.5, 0.0003909, 1.6499, 0.0003115, 1.5882],
  [6, 0.0007056, 1.59, 0.0004878, 1.5728],
  [7, 0.001915, 1.481, 0.001425, 1.4745],
  [8, 0.004115, 1.3905, 0.00345, 1.3797],
  [9, 0.007535, 1.3155, 0.006691, 1.2895],
  [10, 0.01217, 1.2571, 0.01129, 1.2156],
  [11, 0.01772, 1.214, 0.01731, 1.1617],
  [12, 0.02386, 1.1825, 0.02455, 1.1216],
  [13, 0.03041, 1.1586, 0.03266, 1.0901],
  [14, 0.03738, 1.1396, 0.04126, 1.0646],
  [15, 0.04481, 1.1233, 0.05008, 1.044],
  [16, 0.05282, 1.1086, 0.05895, 1.0273],
  [17, 0.06098, 1.0949, 0.06797, 1.0132],
  [18, 0.06903, 1.0818, 0.07665, 1.001],
  [19, 0.07687, 1.0691, 0.08489, 0.9901],
  [20, 0.0845, 1.0568, 0.0925, 0.9802],
  [21, 0.09191, 1.0447, 0.09998, 0.971],
  [22, 0.09934, 1.0329, 0.10742, 0.9625],
  [23, 0.10705, 1.0209, 0.11514, 0.9548],
  [24, 0.11506, 1.0087, 0.12323, 0.9476],
  [25, 0.12335, 0.9965, 0.13164, 0.9408],
  [26, 0.13192, 0.9844, 0.14029, 0.9344],
  [27, 0.14073, 0.9724, 0.14918, 0.9283],
  [28, 0.14976, 0.9605, 0.15824, 0.9225],
  [29, 0.15898, 0.9489, 0.16745, 0.917],
  [30, 0.16836, 0.9376, 0.17681, 0.9117],
  [35, 0.21601, 0.8895, 0.22383, 0.8905],
  [40, 0.26914, 0.8485, 0.27605, 0.8689],
  [45, 0.32543, 0.8155, 0.33134, 0.8484],
  [50, 0.38385, 0.7884, 0.38904, 0.8295],
  [55, 0.44245, 0.7669, 0.44711, 0.8124],
  [60, 0.5008, 0.7502, 0.50517, 0.7971],
  [70, 0.61522, 0.7263, 0.61971, 0.7708],
  [80, 0.72354, 0.7105, 0.72735, 0.7491],
  [90, 0.82683, 0.6998, 0.82942, 0.7305],
  [100, 0.92563, 0.6925, 0.92667, 0.7146]
];

function getFactors(freq: number) {
  const frequencyParameters = FREQUENCY_PARAMETERS;

  for (let index = 0; index < frequencyParameters.length; index += 1) {
    if (frequencyParameters[index][0] > freq) {
      if (index > 0) {
        const freq1 = frequencyParameters[index][0];
        const freq2 = frequencyParameters[index - 1][0];
        const middleFrequency = freq1 - freq;
        const freqDiff = freq1 - freq2;
        const weight1 = (freqDiff - middleFrequency) / freqDiff;
        const weight2 = middleFrequency / freqDiff;

        return [
          freq,
          frequencyParameters[index][1] * weight1 + frequencyParameters[index - 1][1] * weight2,
          frequencyParameters[index][2] * weight1 + frequencyParameters[index - 1][2] * weight2,
          frequencyParameters[index][3] * weight1 + frequencyParameters[index - 1][3] * weight2,
          frequencyParameters[index][4] * weight1 + frequencyParameters[index - 1][4] * weight2
        ];
      }

      return frequencyParameters[index];
    }
  }

  return frequencyParameters[frequencyParameters.length - 1];
}
