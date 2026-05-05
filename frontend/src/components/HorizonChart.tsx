import { useCallback, useRef, useState } from "react";
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
const COMPASS = [
  { label: "N", angle: 0 },
  { label: "NØ", angle: 45 },
  { label: "Ø", angle: 90 },
  { label: "SØ", angle: 135 },
  { label: "S", angle: 180 },
  { label: "SV", angle: 225 },
  { label: "V", angle: 270 },
  { label: "NV", angle: 315 },
];

interface HorizonChartProps {
  profile: HorizonProfile;
  latDeg?: number;
}

/** Compute sun path (azimuth, altitude) pairs for a given day-of-year. */
function sunPath(doy: number, latDeg: number, lonDeg: number): { az: number; alt: number }[] {
  const pts: { az: number; alt: number }[] = [];
  const latRad = latDeg * DEG2RAD;
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m <= 30; m += 30) {
      const gamma = fractionalYear(doy, h, 365);
      const decl = solarDeclination(gamma);
      const eqTime = equationOfTime(gamma);
      const offset = timeOffset(eqTime, lonDeg, 1);
      const tst = trueSolarTime(h, m, offset);
      const ha = solarHourAngle(tst);
      const zen = solarZenith(latRad, decl, ha);
      const alt = solarAltitude(zen);
      if (alt <= 0) continue;
      const az = solarAzimuth(latRad, decl, zen, ha);
      pts.push({ az: az * RAD2DEG, alt: alt * RAD2DEG });
    }
  }
  return pts;
}

function toSvg(cx: number, cy: number, chartR: number, maxElev: number, azDeg: number, elevDeg: number) {
  const r = (elevDeg / maxElev) * chartR;
  const svgAngle = (azDeg - 90) * DEG2RAD;
  return { x: cx + r * Math.cos(svgAngle), y: cy + r * Math.sin(svgAngle) };
}

export function HorizonChart({ profile, latDeg }: HorizonChartProps) {
  const { azimuths, heights } = profile;
  const n = azimuths.length;
  const svgRef = useRef<SVGSVGElement>(null);
  interface HoverInfo { azDeg: number; elevDeg: number; svgX: number; svgY: number; label: string; color: string; }
  const [hover, setHover] = useState<HoverInfo | null>(null);
  if (n === 0) return null;

  const elevDegs = Array.from(heights).map((h) => h * RAD2DEG);
  const maxDataElev = Math.max(5, ...elevDegs);
  // Use fixed max to give room for sun paths (90° = zenith, but we cap lower)
  const lonDeg = 10; // default, close enough for path shape
  const lat = latDeg ?? 60;
  const summerPath = sunPath(172, lat, lonDeg); // June 21
  const winterPath = sunPath(355, lat, lonDeg); // Dec 21
  const equinoxPath = sunPath(80, lat, lonDeg); // Mar 21
  const maxSunElev = Math.max(
    0,
    ...summerPath.map((p) => p.alt),
    ...winterPath.map((p) => p.alt),
    ...equinoxPath.map((p) => p.alt),
  );
  const contentMaxElev = Math.max(maxDataElev, maxSunElev);
  const ringStep = contentMaxElev <= 30 ? 5 : 10;
  const maxElev = Math.max(ringStep, Math.ceil((contentMaxElev + 0.75) / ringStep) * ringStep);

  const size = 800;
  const cx = size / 2;
  const sideLabelClearance = 6;
  const northLabelClearance = 6;
  const southLabelClearance = 18;
  const compassLabelGap = 10;
  const labelRadius = Math.min(
    size / 2 - sideLabelClearance,
    (size - northLabelClearance - southLabelClearance) / 2,
  );
  const chartR = labelRadius - compassLabelGap;
  const cy = northLabelClearance + labelRadius;

  // Horizon polygon
  const horizonPts = Array.from({ length: n }, (_, i) => {
    const { x, y } = toSvg(cx, cy, chartR, maxElev, azimuths[i] * RAD2DEG, elevDegs[i]);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // Close
  const first = toSvg(cx, cy, chartR, maxElev, azimuths[0] * RAD2DEG, elevDegs[0]);
  horizonPts.push(`${first.x.toFixed(1)},${first.y.toFixed(1)}`);

  // Grid rings at 10° intervals
  const rings = [];
  for (let elev = ringStep; elev <= maxElev; elev += ringStep) {
    rings.push(elev);
  }

  function pathToSvgD(pts: { az: number; alt: number }[]) {
    if (pts.length === 0) return "";
    return pts.map((p, i) => {
      const { x, y } = toSvg(cx, cy, chartR, maxElev, p.az, p.alt);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const dx = svgPt.x - cx;
    const dy = svgPt.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > chartR + 10) { setHover(null); return; }
    // SVG angle → compass azimuth
    let azRad = Math.atan2(dy, dx) + Math.PI / 2; // +90° because N is up
    if (azRad < 0) azRad += 2 * Math.PI;
    const azDeg = azRad * RAD2DEG;
    // Find nearest profile point
    let bestIdx = 0;
    let bestDiff = 999;
    for (let i = 0; i < n; i++) {
      let diff = Math.abs(azimuths[i] * RAD2DEG - azDeg);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    }
    const elevDeg = elevDegs[bestIdx];
    const pointAz = azimuths[bestIdx] * RAD2DEG;
    const { x: px, y: py } = toSvg(cx, cy, chartR, maxElev, pointAz, elevDeg);

    // Find closest line (terrain or sun path) to cursor
    const svgX = svgPt.x; const svgY = svgPt.y;
    const candidates: { label: string; color: string; cx: number; cy: number; dist: number; elevDeg: number }[] = [];

    // Terrain point
    candidates.push({ label: "Terreng", color: "#475569", cx: px, cy: py, dist: Math.sqrt((svgX-px)**2+(svgY-py)**2), elevDeg: Math.round(elevDeg*10)/10 });

    // Sun paths
    const sunCandidates = [
      { path: summerPath, label: "Sommarsol", color: "#84cc16" },
      { path: equinoxPath, label: "Jevndøgn", color: "#f59e0b" },
      { path: winterPath, label: "Vintersol", color: "#3b82f6" },
    ];
    for (const sc of sunCandidates) {
      let best = { dist: 999, x: 0, y: 0, alt: 0 };
      for (const p of sc.path) {
        const { x: sx, y: sy } = toSvg(cx, cy, chartR, maxElev, p.az, p.alt);
        const d = Math.sqrt((svgX-sx)**2+(svgY-sy)**2);
        if (d < best.dist) best = { dist: d, x: sx, y: sy, alt: p.alt };
      }
      if (best.dist < 999) candidates.push({ label: sc.label, color: sc.color, cx: best.x, cy: best.y, dist: best.dist, elevDeg: Math.round(best.alt*10)/10 });
    }

    const closest = candidates.reduce((a, b) => a.dist < b.dist ? a : b);
    setHover({ azDeg: Math.round(pointAz), elevDeg: closest.elevDeg, svgX: closest.cx, svgY: closest.cy, label: closest.label, color: closest.color });
  }, [azimuths, elevDegs, n, cx, cy, chartR, maxElev]);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  return (
    <>
      <svg ref={svgRef} viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full max-w-[640px]" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <title>Horisontkart med solbane</title>
        {/* Background */}
        <circle cx={cx} cy={cy} r={chartR} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.5} />

        {/* Grid rings */}
        {rings.map((elev) => {
          const r = (elev / maxElev) * chartR;
          return (
            <g key={elev}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={cx + 5} y={cy - r + 6} className="fill-slate-400" style={{ fontSize: 13 }}>{elev}°</text>
            </g>
          );
        })}

        {/* 8 direction lines */}
        {COMPASS.map(({ angle }) => {
          const svgAngle = (angle - 90) * DEG2RAD;
          const x2 = cx + chartR * Math.cos(svgAngle);
          const y2 = cy + chartR * Math.sin(svgAngle);
          return <line key={angle} x1={cx} y1={cy} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth={0.5} />;
        })}

        {/* Sun paths */}
        <path d={pathToSvgD(summerPath)} fill="none" stroke="#84cc16" strokeWidth={1.35} strokeDasharray="4 2" opacity={0.7} />
        <path d={pathToSvgD(equinoxPath)} fill="none" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />
        <path d={pathToSvgD(winterPath)} fill="none" stroke="#3b82f6" strokeWidth={1.35} strokeDasharray="4 2" opacity={0.7} />

        {/* Horizon fill — terrain that blocks the sun */}
        <polygon
          points={horizonPts.join(" ")}
          fill="rgba(100, 116, 139, 0.25)"
          stroke="#475569"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2.5} fill="#0f172a" />

        {/* Compass labels */}
        {COMPASS.map(({ label, angle }) => {
          const svgAngle = (angle - 90) * DEG2RAD;
          const labelR = chartR + compassLabelGap;
          const x = cx + labelR * Math.cos(svgAngle);
          const y = cy + labelR * Math.sin(svgAngle);
          const isBold = label === "N" || label === "S" || label === "Ø" || label === "V";
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: isBold ? 18 : 14 }}
              className={isBold ? "fill-slate-600 font-semibold" : "fill-slate-400 font-medium"}
            >
              {label}
            </text>
          );
        })}

        {/* Hover indicator */}
        {hover && (() => {
          const bw = 170; const bh = 52;
          const bx = hover.svgX < cx ? hover.svgX + 12 : hover.svgX - bw - 12;
          const by = hover.svgY - bh / 2;
          return (
            <g>
              <circle cx={hover.svgX} cy={hover.svgY} r={5} fill={hover.color} stroke="#fff" strokeWidth={2} />
              <rect x={bx} y={by} width={bw} height={bh} rx={4} fill="white" stroke="#e2e8f0" strokeWidth={1} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
              <circle cx={bx + 10} cy={by + 16} r={4} fill={hover.color} />
              <text x={bx + 20} y={by + 20} fontSize={12} fontWeight={600} fill={hover.color}>{hover.label}</text>
              <text x={bx + 10} y={by + 40} fontSize={12} fontWeight={700} fill="#0f172a">{hover.elevDeg}° · azimut {hover.azDeg}°</text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="mt-16 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[15px] font-semibold tracking-[-0.02em] text-slate-700 sm:text-base">
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 shrink-0" style={{ borderTop: "3px dashed #84cc16" }} />
          Sommarsol (21. juni)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 shrink-0" style={{ borderTop: "2px dashed #f59e0b" }} />
          Equinox (21. mars)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4 shrink-0" style={{ borderTop: "3px dashed #3b82f6" }} />
          Vintersol (21. desember)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 shrink-0 rounded-sm bg-slate-400/30 ring-1 ring-slate-500/40" />
          Terrengprofil
        </span>
      </div>
    </>
  );
}
