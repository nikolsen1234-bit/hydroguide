const PVGIS_TMY_URL = "/api/pvgis-tmy";

export interface HourlyClimateYear {
  ghi: Float64Array;
  dhi: Float64Array;
  temperature: Float64Array;
  windSpeed: Float64Array;
  length: number;
  year: number;
  source: string;
  utcDayOfYear: Uint16Array;
  utcHour: Uint8Array;
  utcMonthIndex: Uint8Array;
  servedTmy: { month: number; year: number }[];
  servedTmyLabel: string;
}

interface PvgisTmyHourly {
  "time(UTC)": string;
  "G(h)": number;
  "Gd(h)": number;
  "T2m": number;
  "WS10m": number;
}

interface PvgisTmyResponse {
  outputs: {
    tmy_hourly: PvgisTmyHourly[];
    months_selected?: { month: number; year: number }[];
  };
}

async function fetchPvgisTmy(lat: number, lon: number): Promise<PvgisTmyResponse> {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
  });

  const res = await fetch(`${PVGIS_TMY_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`PVGIS API feil: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<PvgisTmyResponse>;
}

function parseHourlyArrays(hourly: PvgisTmyHourly[]) {
  const n = hourly.length;
  const ghi = new Float64Array(n);
  const dhi = new Float64Array(n);
  const temperature = new Float64Array(n);
  const windSpeed = new Float64Array(n);
  const utcDayOfYear = new Uint16Array(n);
  const utcHour = new Uint8Array(n);
  const utcMonthIndex = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const h = hourly[i];
    ghi[i] = h["G(h)"] ?? 0;
    dhi[i] = h["Gd(h)"] ?? 0;
    temperature[i] = h["T2m"] ?? 5;
    windSpeed[i] = h["WS10m"] ?? 3;

    const time = h["time(UTC)"] ?? "";
    const year = Number.parseInt(time.slice(0, 4), 10);
    const month = Number.parseInt(time.slice(4, 6), 10);
    const day = Number.parseInt(time.slice(6, 8), 10);
    const hour = Number.parseInt(time.slice(9, 11), 10);

    const timestampUtc = new Date(Date.UTC(year, month - 1, day, hour));
    const startOfYearUtc = Date.UTC(year, 0, 0);
    utcDayOfYear[i] = Math.floor((timestampUtc.getTime() - startOfYearUtc) / 86_400_000);
    utcHour[i] = hour;
    utcMonthIndex[i] = timestampUtc.getUTCMonth();
  }

  return { ghi, dhi, temperature, windSpeed, length: n, utcDayOfYear, utcHour, utcMonthIndex };
}

function referenceYear(response: PvgisTmyResponse): number {
  const months = response.outputs.months_selected;
  if (months && months.length > 0) return months[0].year;
  const firstTime = response.outputs.tmy_hourly?.[0]?.["time(UTC)"] ?? "";
  const y = parseInt(firstTime.slice(0, 4), 10);
  return Number.isFinite(y) ? y : 2005;
}

function servedTmyLabel(months: { month: number; year: number }[] | undefined): string {
  if (!months || months.length === 0) return "TMY-servert grunnlag ukjent";
  const monthLabels = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return `TMY-servert: ${months.map(({ month, year }) => `${monthLabels[month - 1] ?? month}.${year}`).join(", ")}`;
}

export async function fetchHourlyClimateYear(lat: number, lon: number): Promise<HourlyClimateYear> {
  const response = await fetchPvgisTmy(lat, lon);
  const arrays = parseHourlyArrays(response.outputs.tmy_hourly);
  const servedMonths = response.outputs.months_selected ?? [];

  return {
    ...arrays,
    year: referenceYear(response),
    source: "PVGIS 5.3 TMY (EU JRC) · time(UTC)",
    servedTmy: servedMonths,
    servedTmyLabel: servedTmyLabel(servedMonths),
  };
}
