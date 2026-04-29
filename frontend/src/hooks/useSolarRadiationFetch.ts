import { useCallback, useState } from "react";
import { MONTH_KEYS } from "../constants";
import type { MonthlySolarRadiation, MonthKey } from "../types";
import { monthlyIrradianceFromHourlyYear, type HorizonProfile } from "../lib/solarEngine";
import { generateHorizonProfile } from "../lib/horizonProfile";
import { fetchHourlyClimateYear } from "../lib/metClient";
import { setHorizonProfile } from "../lib/horizonStore";

interface SolarRadiationFetchState {
  loading: boolean;
  error: string | null;
  source: string | null;
  servedTmy: string | null;
  horizonProfile: HorizonProfile | null;
}

export function useSolarRadiationFetch() {
  const [state, setState] = useState<SolarRadiationFetchState>({
    loading: false,
    error: null,
    source: null,
    servedTmy: null,
    horizonProfile: null,
  });

  const fetchSolarRadiation = useCallback(
    async (
      lat: number,
      lon: number,
      tilt: number,
      azimuth: number,
      heightOffset = 0
    ): Promise<MonthlySolarRadiation | null> => {
      setState({ loading: true, error: null, source: null, servedTmy: null, horizonProfile: null });

      try {
        const [climateYear, horizonProfile] = await Promise.all([
          fetchHourlyClimateYear(lat, lon),
          generateHorizonProfile(lat, lon, heightOffset),
        ]);

        const result = monthlyIrradianceFromHourlyYear({
          latDeg: lat,
          lonDeg: lon,
          tiltDeg: tilt,
          orientDeg: azimuth,
          hourlyGhi: climateYear.ghi,
          hourlyDhi: climateYear.dhi,
          hourlyTemp: climateYear.temperature,
          hourlyWind: climateYear.windSpeed,
          numHours: climateYear.length,
          year: climateYear.year,
          utcDayOfYear: climateYear.utcDayOfYear,
          utcHour: climateYear.utcHour,
          utcMonthIndex: climateYear.utcMonthIndex,
          horizonProfile,
        });

        const radiation: MonthlySolarRadiation = {} as MonthlySolarRadiation;
        for (const key of MONTH_KEYS) {
          (radiation as Record<MonthKey, number | "">)[key] = result.months[key] ?? "";
        }

        setHorizonProfile(horizonProfile);
        setState({
          loading: false,
          error: null,
          source: `${climateYear.source} · PVGIS 6.0 transponering · Kartverket DTM1-horisont`,
          servedTmy: climateYear.servedTmyLabel,
          horizonProfile,
        });

        return radiation;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Ukjend feil";
        setState({ loading: false, error: message, source: null, servedTmy: null, horizonProfile: null });
        return null;
      }
    },
    []
  );

  return { ...state, fetchSolarRadiation };
}
