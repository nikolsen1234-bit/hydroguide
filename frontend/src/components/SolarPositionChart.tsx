/**
 * Solar Position Time-Series Chart
 *
 * Shows altitude, azimuth, and incidence angle through the day for three
 * reference seasons (summer solstice, equinox, winter solstice) plus a
 * user-selected arbitrary date. Overlaid with horizon height at each point.
 *
 * Panel tilt/azimuth from user settings drives the incidence calculation.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { HorizonProfile } from "../lib/solarEngine";
import {
  fractionalYear,
  solarDeclination,
  equationOfTime,
  timeOffset,
  trueSolarTime,
  solarHourAngle,
  solarZenith,
  solarAltitude,
  solarAzimuth,
  solarIncidence,
  interpolateHorizonHeight,
} from "../lib/solarEngine";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

interface SolarPositionChartProps {
  profile: HorizonProfile;
  latDeg: number;
  lonDeg: number;
  tiltDeg: number;
  azimuthDeg: number; // panel orientation, degrees from north
}

interface HourPoint {
  hour: number;
  altitude: number;     // degrees
  azimuth: number;      // degrees
  incidence: number;    // degrees (complementary — 0=grazing, 90=normal)
  horizonH: number;     // degrees
  inShade: boolean;
}

function computeDayData(
  doy: number,
  latDeg: number,
  lonDeg: number,
  tiltRad: number,
  orientRad: number,
  profile: HorizonProfile,
): HourPoint[] {
  const latRad = latDeg * DEG2RAD;
  const pts: HourPoint[] = [];

  for (let h10 = 0; h10 <= 240; h10++) {
    const hour = h10 / 10;
    const hInt = Math.floor(hour);
    const mInt = Math.round((hour - hInt) * 60);
    const gamma = fractionalYear(doy, hInt, 365);
    const decl = solarDeclination(gamma);
    const eqTime = equationOfTime(gamma);
    const offset = timeOffset(eqTime, lonDeg, 1);
    const tst = trueSolarTime(hInt, mInt, offset);
    const ha = solarHourAngle(tst);
    const zen = solarZenith(latRad, decl, ha);
    const alt = solarAltitude(zen);
    if (alt <= 0) continue;

    const az = solarAzimuth(latRad, decl, zen, ha);
    const inc = solarIncidence(zen, az, tiltRad, orientRad);

    const hh = interpolateHorizonHeight(profile, new Float64Array([az]));
    const horizonDeg = hh[0] * RAD2DEG;
    const inShade = alt * RAD2DEG < horizonDeg;

    pts.push({
      hour,
      altitude: alt * RAD2DEG,
      azimuth: az * RAD2DEG,
      incidence: inc * RAD2DEG,
      horizonH: horizonDeg,
      inShade,
    });
  }
  return pts;
}

/** Day-of-year from a Date object (1-based). */
function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

/** Format date as YYYY-MM-DD for input[type=date]. */
function toDateStr(doy: number, year?: number): string {
  const y = year ?? new Date().getFullYear();
  const d = new Date(y, 0, 1);
  d.setDate(doy);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Short Norwegian label for a date. */
function formatLabel(doy: number): string {
  const d = new Date(new Date().getFullYear(), 0);
  d.setDate(doy);
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return `${d.getDate()}. ${months[d.getMonth()]}`;
}

// ---------------------------------------------------------------------------
// Chart layout
// ---------------------------------------------------------------------------

const W = 1200;
const H = 440;
const PL = 52;  // pad left
const PR = 30;
const PT = 24;
const PB = 40;
const CW = W - PL - PR;
const CH = H - PT - PB;

const LINE_COLOR = "#10b981";

export function SolarPositionChart({ profile, latDeg, lonDeg, tiltDeg, azimuthDeg }: SolarPositionChartProps) {
  const tiltRad = tiltDeg * DEG2RAD;
  const orientRad = azimuthDeg * DEG2RAD;

  // User-selected date
  const today = new Date();
  const todayDoy = dayOfYear(today);
  const [selectedDoy, setSelectedDoy] = useState<number>(todayDoy);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value + "T12:00:00");
    if (!isNaN(d.getTime())) {
      setSelectedDoy(dayOfYear(d));
    }
  };

  const dayData = useMemo(() =>
    computeDayData(selectedDoy, latDeg, lonDeg, tiltRad, orientRad, profile),
    [latDeg, lonDeg, tiltRad, orientRad, profile, selectedDoy],
  );

  // X: hours 0-24, Y: degrees 0-90
  const xMin = 0, xMax = 24;
  const yMin = 0, yMax = 90;

  const toX = (h: number) => PL + ((h - xMin) / (xMax - xMin)) * CW;
  const toY = (d: number) => PT + CH - ((d - yMin) / (yMax - yMin)) * CH;

  // Build SVG path strings
  const pathD = (pts: HourPoint[], fn: (p: HourPoint) => number) => {
    if (pts.length === 0) return "";
    return pts.map((p, i) =>
      `${i === 0 ? "M" : "L"}${toX(p.hour).toFixed(1)},${toY(fn(p)).toFixed(1)}`
    ).join("");
  };

  // Hover
  const svgRef = useRef<SVGSVGElement>(null);
  interface SolarTooltip { svgX: number; svgY: number; hour: number; incidence: number; horizonH: number; inShade: boolean; }
  const [tooltip, setTooltip] = useState<SolarTooltip | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || dayData.length === 0) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const svgX = svgPt.x;
    if (svgX < PL || svgX > PL + CW || svgPt.y < PT || svgPt.y > PT + CH) { setTooltip(null); return; }
    const hovered = ((svgX - PL) / CW) * (xMax - xMin) + xMin;
    let best = dayData[0];
    let bestDiff = Math.abs(dayData[0].hour - hovered);
    for (const p of dayData) {
      const d = Math.abs(p.hour - hovered);
      if (d < bestDiff) { bestDiff = d; best = p; }
    }
    setTooltip({ svgX: toX(best.hour), svgY: toY(best.incidence), hour: best.hour, incidence: Math.round(best.incidence * 10) / 10, horizonH: Math.round(best.horizonH * 10) / 10, inShade: best.inShade });
  }, [dayData, xMax, xMin]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="mt-6">
      {/* Date picker */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-600">Dato:</label>
        <input
          type="date"
          value={toDateStr(selectedDoy)}
          onChange={handleDateChange}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
        />
      </div>

      {/* Incidence chart */}
      <div className="mb-4">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <title>Solposisjon gjennom dagen</title>
          <rect x={PL} y={PT} width={CW} height={CH} fill="#f8fafc" rx={2} />

          {/* Y grid */}
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((d) => (
            <g key={d}>
              <line x1={PL} y1={toY(d)} x2={PL + CW} y2={toY(d)} stroke="#e2e8f0" strokeWidth={d === 0 ? 0.8 : 0.4} />
              <text x={PL - 4} y={toY(d) + 3.5} textAnchor="end" fill="#94a3b8" fontSize={9}>{d}°</text>
            </g>
          ))}

          {/* X grid */}
          {Array.from({ length: 25 }, (_, i) => i).map((h) => (
            <g key={h}>
              {h % 3 === 0 && <line x1={toX(h)} y1={PT} x2={toX(h)} y2={PT + CH} stroke="#e2e8f0" strokeWidth={0.4} />}
              {h % 3 === 0 && <text x={toX(h)} y={PT + CH + 14} textAnchor="middle" fill="#64748b" fontSize={9}>{String(h).padStart(2, "0")}:00</text>}
            </g>
          ))}

          {/* Incidence line */}
          {dayData.length > 0 && (
            <path
              d={pathD(dayData, (p) => p.incidence)}
              fill="none"
              stroke={LINE_COLOR}
              strokeWidth={2.5}
            />
          )}

          <text x={PL - 4} y={PT - 10} textAnchor="end" fill="#64748b" fontSize={8}>grader</text>

          {/* Hover tooltip */}
          {tooltip && (() => {
            const bw = 180; const bh = 68;
            const bx = tooltip.svgX + 12 + bw > PL + CW ? tooltip.svgX - bw - 12 : tooltip.svgX + 12;
            const by = Math.max(PT + 4, PT + CH / 2 - bh / 2);
            const hStr = `${String(Math.floor(tooltip.hour)).padStart(2, "0")}:${String(Math.round((tooltip.hour % 1) * 60)).padStart(2, "0")}`;
            return (
              <g>
                <line x1={tooltip.svgX} y1={PT} x2={tooltip.svgX} y2={PT + CH} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
                <circle cx={tooltip.svgX} cy={tooltip.svgY} r={5} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
                <rect x={bx} y={by} width={bw} height={bh} rx={4} fill="white" stroke="#e2e8f0" strokeWidth={1} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
                <text x={bx + 10} y={by + 16} fontSize={12} fontWeight={700} fill="#0f172a">{hStr}</text>
                <circle cx={bx + 14} cy={by + 32} r={4} fill={LINE_COLOR} />
                <text x={bx + 24} y={by + 36} fontSize={11} fontWeight={600} fill={LINE_COLOR}>Innfallsvinkel</text>
                <text x={bx + bw - 10} y={by + 36} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">{tooltip.incidence}°</text>
                <circle cx={bx + 14} cy={by + 52} r={4} fill="#94a3b8" />
                <text x={bx + 24} y={by + 56} fontSize={11} fontWeight={600} fill="#475569">Horisont</text>
                <text x={bx + bw - 10} y={by + 56} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">{tooltip.horizonH}°{tooltip.inShade ? " (skugge)" : ""}</text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: LINE_COLOR, height: 2.5 }} />
          Innfallsvinkel ({formatLabel(selectedDoy)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm bg-slate-100 ring-1 ring-slate-300/60" />
          I skugge
        </span>
      </div>
    </div>
  );
}
