/**
 * Panoramic POV Horizon Chart — as seen from the measurement station.
 *
 * X-axis: compass direction (N → E → S → W → N)
 * Y-axis: elevation angle (degrees)
 * Terrain silhouette filled, sun paths overlaid with hour markers.
 * Includes "Download PDF" button that renders to canvas and saves.
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
} from "../lib/solarEngine";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

interface PanoramicHorizonProps {
  profile: HorizonProfile;
  latDeg: number;
  lonDeg: number;
  locationName?: string;
}

// ---------------------------------------------------------------------------
// Sun path helpers (same NOAA algorithms as solarEngine.ts)
// ---------------------------------------------------------------------------

interface SunPoint { az: number; alt: number; hour: number }

function computeSunPath(doy: number, latDeg: number, lonDeg: number): SunPoint[] {
  const latRad = latDeg * DEG2RAD;
  const pts: SunPoint[] = [];
  for (let h100 = 0; h100 < 2400; h100 += 15) {
    const hour = h100 / 100;
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
    pts.push({ az: az * RAD2DEG, alt: alt * RAD2DEG, hour });
  }
  return pts;
}

function computeHourMarkers(doy: number, latDeg: number, lonDeg: number): SunPoint[] {
  const latRad = latDeg * DEG2RAD;
  const markers: SunPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const gamma = fractionalYear(doy, h, 365);
    const decl = solarDeclination(gamma);
    const eqTime = equationOfTime(gamma);
    const offset = timeOffset(eqTime, lonDeg, 1);
    const tst = trueSolarTime(h, 0, offset);
    const ha = solarHourAngle(tst);
    const zen = solarZenith(latRad, decl, ha);
    const alt = solarAltitude(zen);
    if (alt <= 0) continue;
    const az = solarAzimuth(latRad, decl, zen, ha);
    markers.push({ az: az * RAD2DEG, alt: alt * RAD2DEG, hour: h });
  }
  return markers;
}

function interpolateHorizon(azimuths: Float64Array, heights: Float64Array, azDeg: number): number {
  const n = azimuths.length;
  const az = ((azDeg % 360) + 360) % 360;
  const azRad = az * DEG2RAD;
  for (let i = 0; i < n; i++) {
    const a0 = azimuths[i];
    const a1 = azimuths[(i + 1) % n];
    const h0 = heights[i] * RAD2DEG;
    const h1 = heights[(i + 1) % n] * RAD2DEG;
    let a1adj = a1;
    if (a1adj < a0) a1adj += 2 * Math.PI;
    let azCheck = azRad;
    if (azCheck < a0) azCheck += 2 * Math.PI;
    if (a0 <= azCheck && azCheck <= a1adj) {
      const span = a1adj - a0;
      if (span === 0) return h0;
      const t = (azCheck - a0) / span;
      return h0 + t * (h1 - h0);
    }
  }
  return heights[0] * RAD2DEG;
}

// ---------------------------------------------------------------------------
// SVG constants
// ---------------------------------------------------------------------------
const W = 1400;
const H = 620;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 40;
const CW = W - PAD_L - PAD_R;
const CH = H - PAD_T - PAD_B;


const SUN_PATHS = [
  { doy: 172, color: "#d97706", label: "Sommarsol (21. juni)", lw: 3 },
  { doy: 80, color: "#dc2626", label: "Jevndøgn (21. mars)", lw: 2.5 },
  { doy: 355, color: "#2563eb", label: "Vintersol (21. des.)", lw: 3 },
] as const;

export function PanoramicHorizon({ profile, latDeg, lonDeg, locationName }: PanoramicHorizonProps) {
  const { azimuths, heights } = profile;
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute all sun paths
  const sunData = useMemo(() =>
    SUN_PATHS.map((sp) => ({
      ...sp,
      path: computeSunPath(sp.doy, latDeg, lonDeg),
      markers: computeHourMarkers(sp.doy, latDeg, lonDeg),
    })),
    [latDeg, lonDeg],
  );

  // Compute axis range
  const { altMax, ringStep } = useMemo(() => {
    let maxH = 5;
    for (let i = 0; i < heights.length; i++) {
      const d = heights[i] * RAD2DEG;
      if (d > maxH) maxH = d;
    }
    let maxSun = 0;
    for (const sd of sunData) {
      for (const p of sd.path) {
        if (p.alt > maxSun) maxSun = p.alt;
      }
    }
    const contentMax = Math.max(maxH + 3, maxSun + 3);
    const step = contentMax <= 30 ? 5 : 10;
    const top = Math.max(step, Math.ceil(contentMax / step) * step);
    return { altMax: top, ringStep: step };
  }, [heights, sunData]);

  const azToX = (az: number) => PAD_L + (az / 360) * CW;
  const altToY = (alt: number) => PAD_T + CH - (alt / altMax) * CH;

  // Terrain polygon points
  const terrainD = useMemo(() => {
    const parts: string[] = [`M${PAD_L},${PAD_T + CH}`];
    for (let azx10 = 0; azx10 <= 3600; azx10++) {
      const az = azx10 / 10;
      const h = interpolateHorizon(azimuths, heights, az);
      parts.push(`L${azToX(az).toFixed(1)},${altToY(h).toFixed(1)}`);
    }
    parts.push(`L${azToX(360).toFixed(1)},${PAD_T + CH}Z`);
    return parts.join("");
  }, [azimuths, heights, altMax]);

  // Terrain top edge
  const terrainEdgeD = useMemo(() => {
    const parts: string[] = [];
    for (let azx10 = 0; azx10 <= 3600; azx10++) {
      const az = azx10 / 10;
      const h = interpolateHorizon(azimuths, heights, az);
      parts.push(`${azx10 === 0 ? "M" : "L"}${azToX(az).toFixed(1)},${altToY(h).toFixed(1)}`);
    }
    return parts.join("");
  }, [azimuths, heights, altMax]);

  // Sun path SVG paths
  const sunPathDs = useMemo(() =>
    sunData.map((sd) => {
      if (sd.path.length === 0) return "";
      return sd.path.map((p, i) =>
        `${i === 0 ? "M" : "L"}${azToX(p.az).toFixed(1)},${altToY(p.alt).toFixed(1)}`
      ).join("");
    }),
    [sunData, altMax],
  );

  // Download as PNG
  const handleDownload = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const canvas = document.createElement("canvas");
    const scale = 3; // high-res
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#0f1729";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = `horisontprofil_${locationName?.replace(/\s+/g, "_") || "stasjon"}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    };
    img.src = url;
  }, [locationName]);

  // Sky gradient stops
  const skyId = "panoramic-sky-grad";

  // Grid lines for altitude
  const altGridLines: number[] = [];
  for (let a = ringStep; a <= altMax; a += ringStep) altGridLines.push(a);

  // Hover tooltip state
  interface TooltipInfo {
    svgX: number; svgY: number;
    terrainDotY: number;
    azDeg: number;
    horizonH: number;
    sun: { label: string; color: string; alt: number; hour: number; dotY: number } | null;
  }
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const svgX = svgPt.x; const svgY = svgPt.y;
    if (svgX < PAD_L || svgX > PAD_L + CW || svgY < PAD_T || svgY > PAD_T + CH) {
      setTooltip(null); return;
    }
    const azDeg = ((svgX - PAD_L) / CW) * 360;
    const horizonH = interpolateHorizon(azimuths, heights, azDeg);
    const terrainDotY = altToY(horizonH);

    // Find closest sun path point within 20px
    let bestSun: TooltipInfo["sun"] = null;
    let bestDist = 20;
    for (const sd of sunData) {
      for (const p of sd.path) {
        const px = azToX(p.az); const py = altToY(p.alt);
        const dist = Math.sqrt((svgX - px) ** 2 + (svgY - py) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
          bestSun = { label: sd.label, color: sd.color, alt: p.alt, hour: Math.round(p.hour), dotY: py };
        }
      }
    }

    setTooltip({ svgX, svgY, terrainDotY, azDeg, horizonH, sun: bestSun });
  }, [azimuths, heights, sunData, altMax]);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full rounded-lg"
        style={{ maxWidth: "100%" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Sky gradient — light */}
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="60%" stopColor="#eff6ff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </linearGradient>
        </defs>
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH} fill={`url(#${skyId})`} rx={3} />

        {/* Altitude grid */}
        {altGridLines.map((a) => (
          <g key={a}>
            <line x1={PAD_L} y1={altToY(a)} x2={PAD_L + CW} y2={altToY(a)} stroke="rgba(100,116,139,0.2)" strokeWidth={0.5} />
            <text x={PAD_L - 5} y={altToY(a) + 3.5} textAnchor="end" fill="#94a3b8" fontSize={11}>{a}°</text>
          </g>
        ))}
        {/* 0° line */}
        <line x1={PAD_L} y1={altToY(0)} x2={PAD_L + CW} y2={altToY(0)} stroke="rgba(100,116,139,0.35)" strokeWidth={0.8} />
        <text x={PAD_L - 5} y={altToY(0) + 3.5} textAnchor="end" fill="#94a3b8" fontSize={11}>0°</text>

        {/* Azimuth grid */}
        {Array.from({ length: 25 }, (_, i) => i * 15).map((az) => {
          const x = azToX(az);
          const isMajor = az % 45 === 0;
          return (
            <g key={az}>
              <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + CH} stroke={isMajor ? "rgba(100,116,139,0.25)" : "rgba(100,116,139,0.1)"} strokeWidth={isMajor ? 0.8 : 0.4} />
              {isMajor ? (
                <text x={x} y={PAD_T + CH + 16} textAnchor="middle" fill="#475569" fontSize={12} fontWeight="bold">{az}°</text>
              ) : null}
            </g>
          );
        })}

        {/* Sun paths */}
        {sunPathDs.map((d, i) => d && (
          <path key={i} d={d} fill="none" stroke={sunData[i].color} strokeWidth={sunData[i].lw} opacity={0.9} />
        ))}

        {/* Hour markers */}
        {sunData.map((sd, si) =>
          sd.markers.map((m) => (
            <g key={`${si}-${m.hour}`}>
              <circle cx={azToX(m.az)} cy={altToY(m.alt)} r={5} fill={sd.color} stroke="white" strokeWidth={1.5} />
              <text
                x={azToX(m.az)}
                y={altToY(m.alt) - 9}
                textAnchor="middle"
                fill="#0f172a"
                fontSize={11}
                fontWeight="bold"
              >
                {String(m.hour).padStart(2, "0")}
              </text>
            </g>
          ))
        )}

        {/* Terrain fill */}
        <path d={terrainD} fill="rgba(34,80,34,0.65)" />
        {/* Terrain edge */}
        <path d={terrainEdgeD} fill="none" stroke="#1a4a1a" strokeWidth={1.5} />

        {/* Border */}
        <rect x={PAD_L} y={PAD_T} width={CW} height={CH} fill="none" stroke="#e2e8f0" strokeWidth={1} rx={3} />

        {/* Hover tooltip */}
        {tooltip && (() => {
          const rows: { label: string; color: string; value: string }[] = [
            { label: "Terreng", color: "#16a34a", value: `${tooltip.horizonH.toFixed(1)}°` },
          ];
          if (tooltip.sun) {
            rows.push({ label: tooltip.sun.label, color: tooltip.sun.color, value: `${tooltip.sun.alt.toFixed(1)}°` });
          }
          const bw = 210; const bh = 20 + rows.length * 20 + 8;
          const bx = tooltip.svgX + 12 + bw > PAD_L + CW ? tooltip.svgX - bw - 12 : tooltip.svgX + 12;
          const by = Math.max(PAD_T + 4, tooltip.svgY - bh / 2);
          return (
            <g>
              <line x1={tooltip.svgX} y1={PAD_T} x2={tooltip.svgX} y2={PAD_T + CH} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
              <circle cx={tooltip.svgX} cy={tooltip.terrainDotY} r={5} fill="#16a34a" stroke="white" strokeWidth={2} />
              {tooltip.sun && <circle cx={tooltip.svgX} cy={tooltip.sun.dotY} r={5} fill={tooltip.sun.color} stroke="white" strokeWidth={2} />}
              <rect x={bx} y={by} width={bw} height={bh} rx={4} fill="white" stroke="#e2e8f0" strokeWidth={1} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
              <text x={bx + 10} y={by + 16} fontSize={12} fontWeight={700} fill="#0f172a">Azimut {tooltip.azDeg.toFixed(1)}°</text>
              {rows.map((r, i) => (
                <g key={i}>
                  <circle cx={bx + 14} cy={by + 30 + i * 20} r={4} fill={r.color} />
                  <text x={bx + 24} y={by + 34 + i * 20} fontSize={11} fontWeight={600} fill={r.color}>{r.label}</text>
                  <text x={bx + bw - 10} y={by + 34 + i * 20} fontSize={11} fontWeight={700} fill="#0f172a" textAnchor="end">{r.value}</text>
                </g>
              ))}
            </g>
          );
        })()}
      </svg>

      {/* Legend + download */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-600">
          {SUN_PATHS.map((sp) => (
            <span key={sp.doy} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: sp.color, height: sp.lw }} />
              {sp.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-sm" style={{ backgroundColor: "rgba(34,80,34,0.75)" }} />
            Terrengprofil
          </span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
        >
          Last ned PNG
        </button>
      </div>
    </div>
  );
}
