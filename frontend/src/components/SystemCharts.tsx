import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useId, useState } from "react";
import { useLanguage } from "../i18n";
import { workspaceSectionTitleClassName } from "../styles/workspace";
import { CostComparisonItem, MonthlyEnergyBalanceRow } from "../types";
import { formatNumber } from "../utils/format";
import { HelpTip } from "./WorkspaceActions";

const CHART_COLORS = {
  solar: "#f59e0b",
  solarFill: "#fbbf24",
  battery: "#94a3b8",
  batteryFill: "#cbd5e1",
  load: "#334155",
  reserve: "#2563eb",
  methanol: "#16a34a",
  diesel: "#b91c1c",
  positiveBalance: "#2563eb",
  negativeBalance: "#e11d48"
} as const;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function EmptyChart({ text }: { text: string }) {
  const bars: [number, number][] = [[18, 48], [42, 30], [22, 44], [38, 36], [46, 26], [28, 40], [16, 50]];
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 border-y border-dashed border-slate-200">
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 stroke-slate-300" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-5 11.9V18h10v-4.1A7 7 0 0 0 12 2z" />
      </svg>
      <p className="text-sm italic text-slate-400">{text}</p>
      <div className="flex items-end gap-1">
        {bars.map(([a, b], i) => (
          <div key={i} className="flex items-end gap-px">
            <div className="w-2 rounded-t-sm bg-slate-200" style={{ height: `${a}px` }} />
            <div className="w-2 rounded-t-sm bg-slate-300/50" style={{ height: `${b}px` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ title, helper, children }: { title: string; helper?: string; children: ReactNode }) {
  return (
    <section className="py-1">
      <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={workspaceSectionTitleClassName}>{title}</h2>
            {helper ? <HelpTip text={helper} /> : null}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function buildLinePath(values: number[], mapY: (value: number) => number, startX: number, stepX: number) {
  return values
    .map((value, index) => {
      const x = startX + index * stepX + stepX / 2;
      return `${index === 0 ? "M" : "L"} ${x} ${mapY(value)}`;
    })
    .join(" ");
}

function getNiceAxisLimit(value: number) {
  if (value <= 0) return 0;

  const paddedValue = value * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(paddedValue));
  const normalized = paddedValue / magnitude;

  let niceNormalized = 1;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 2.5) niceNormalized = 2.5;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  return niceNormalized * magnitude;
}

function getAxisTicks(limit: number) {
  if (limit <= 0) return [];
  return [limit / 2, limit];
}

export function EnergyOverviewChart({
  rows,
  backupSource
}: {
  rows: MonthlyEnergyBalanceRow[];
  backupSource?: "Brenselcelle" | "Dieselaggregat" | "Ikkje berekna";
}) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const chartTitleId = useId();
  const chartDescId = useId();

  if (rows.length === 0) {
    return (
      <ChartCard title={t("charts.energyThroughYear")}>
        <EmptyChart text={t("charts.fillSystemData")} />
      </ChartCard>
    );
  }

  const width = isMobile ? 580 : 1040;
  const height = isMobile ? 340 : 380;
  const left = isMobile ? 36 : 52;
  const right = left;
  const top = isMobile ? 18 : 22;
  const bottom = isMobile ? 38 : 44;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const hasReserveCoverage = Boolean(backupSource && backupSource !== "Ikkje berekna");
  const maxPositiveEnergy = getNiceAxisLimit(Math.max(
    ...rows.map((row) => Math.max(row.loadDemandKWh, row.solarProductionKWh, 1))
  ));
  const maxNegativeEnergy = getNiceAxisLimit(Math.max(
    ...rows.map((row) => Math.max(0, -row.energyBalanceKWh)),
    0
  ));
  const hasNegativeBalance = maxNegativeEnergy > 0;
  const negativeRatio = hasNegativeBalance ? maxNegativeEnergy / (maxPositiveEnergy + maxNegativeEnergy) : 0;
  const zeroY = top + innerHeight * (1 - negativeRatio);
  const positiveHeight = zeroY - top;
  const negativeHeight = top + innerHeight - zeroY;
  const rawMaxFuelValue = hasReserveCoverage ? Math.max(...rows.map((row) => row.fuelLiters), 0) : 0;
  const maxFuelValue = rawMaxFuelValue > 0 ? getNiceAxisLimit(rawMaxFuelValue) : 0;
  const stepX = innerWidth / rows.length;
  const balanceBarWidth = Math.min(16, stepX * 0.34);
  const toEnergyY = (value: number) => zeroY - (value / maxPositiveEnergy) * positiveHeight;
  const toFuelY = (value: number) =>
    maxFuelValue > 0 ? zeroY - (value / maxFuelValue) * positiveHeight : zeroY;
  const fuelColor =
    backupSource === "Brenselcelle"
      ? CHART_COLORS.methanol
      : backupSource === "Dieselaggregat"
        ? CHART_COLORS.diesel
        : CHART_COLORS.reserve;
  const fuelLabel = backupSource === "Brenselcelle" ? t("charts.fuelCell") : t("charts.dieselGenerator");
  const chartHelper = hasReserveCoverage
    ? t("charts.energyOverviewHelper").replace("{fuel}", fuelLabel.toLowerCase())
    : t("charts.energyOverviewHelperNoReserve");
  const loadPath = buildLinePath(
    rows.map((row) => row.loadDemandKWh),
    toEnergyY,
    left,
    stepX
  );
  const solarPath = buildLinePath(
    rows.map((row) => row.solarProductionKWh),
    toEnergyY,
    left,
    stepX
  );
  const reservePath = buildLinePath(
    rows.map((row) => row.fuelLiters),
    toFuelY,
    left,
    stepX
  );
  const axisRatios = [0, 0.25, 0.5, 0.75, 1];

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * width;
    const index = Math.round((relativeX - left - stepX / 2) / stepX);
    setActiveIndex(Math.max(0, Math.min(rows.length - 1, index)));
  }

  const hoverRow = activeIndex !== null ? rows[activeIndex] : null;
  const hoverX = activeIndex !== null ? left + activeIndex * stepX + stepX / 2 : 0;
  const tooltipW = isMobile ? 180 : 220;
  const tooltipH = hasReserveCoverage ? (isMobile ? 120 : 130) : isMobile ? 98 : 108;
  const tooltipX = activeIndex !== null
    ? Math.min(Math.max(hoverX + 14, 16), width - tooltipW - 8)
    : 0;
  const tooltipY = activeIndex !== null
    ? Math.max(top + 4, Math.min(toEnergyY(rows[activeIndex].loadDemandKWh) - tooltipH - 8, height - bottom - tooltipH))
    : 0;

  return (
    <ChartCard title={t("charts.energyThroughYear")} helper={chartHelper}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full overflow-visible"
        style={{ zIndex: 10, position: "relative" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setActiveIndex(null)}
        role="img"
        aria-labelledby={`${chartTitleId} ${chartDescId}`}
      >
        <title id={chartTitleId}>{t("charts.energyThroughYear")}</title>
        <desc id={chartDescId}>{chartHelper}</desc>
        {axisRatios.map((ratio) => {
          const y = zeroY - positiveHeight * ratio;
          const energyLabel = maxPositiveEnergy * ratio;

          return (
            <g key={ratio}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 5" />
              <text x={left - 8} y={y + 5} textAnchor="end" className="fill-slate-500 text-[13px]">
                {formatNumber(energyLabel, 0)}
              </text>
            </g>
          );
        })}
        {hasNegativeBalance ? [0.5, 1].map((ratio) => {
          const y = zeroY + negativeHeight * ratio;
          const energyLabel = -maxNegativeEnergy * ratio;

          return (
            <g key={`neg-${ratio}`}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 5" />
              <text x={left - 8} y={y + 5} textAnchor="end" className="fill-slate-500 text-[13px]">
                {formatNumber(energyLabel, 0)}
              </text>
            </g>
          );
        }) : null}
        {hasReserveCoverage
          ? axisRatios.map((ratio) => {
              const y = zeroY - positiveHeight * ratio;
              const fuelAxisLabel = maxFuelValue * ratio;

              return (
                <text key={`fuel-axis-${ratio}`} x={width - right + 8} y={y + 5} className="fill-slate-500 text-[13px]">
                  {formatNumber(fuelAxisLabel, 0)}
                </text>
              );
            })
          : null}

        <text
          x={6}
          y={top + innerHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90, 6, ${top + innerHeight / 2})`}
          className="fill-slate-950 text-[13px] font-semibold"
        >
          {t("charts.energyAxis")}
        </text>
        {hasReserveCoverage ? (
          <text
            x={width - 6}
            y={top + innerHeight / 2}
            textAnchor="middle"
            transform={`rotate(90, ${width - 6}, ${top + innerHeight / 2})`}
            className="fill-slate-950 text-[13px] font-semibold"
          >
            {`${fuelLabel} (l)`}
          </text>
        ) : null}

        <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" />

        {rows.map((row, index) => {
          const barX = left + index * stepX + (stepX - balanceBarWidth) / 2;
          const pointX = left + index * stepX + stepX / 2;
          const balance = row.energyBalanceKWh;
          const isPositive = balance >= 0;
          const barH = isPositive
            ? maxPositiveEnergy > 0 ? (Math.abs(balance) / maxPositiveEnergy) * positiveHeight : 0
            : maxNegativeEnergy > 0 ? (Math.abs(balance) / maxNegativeEnergy) * negativeHeight : 0;
          const visibleBarH = barH > 0 ? Math.max(barH, 2) : 0;

          return (
            <g key={row.month}>
              <rect
                x={barX}
                y={isPositive ? zeroY - visibleBarH : zeroY}
                width={balanceBarWidth}
                height={visibleBarH}
                rx="8"
                fill={isPositive ? CHART_COLORS.positiveBalance : CHART_COLORS.negativeBalance}
                fillOpacity="0.2"
              />
              <circle cx={pointX} cy={toEnergyY(row.loadDemandKWh)} r="5.5" fill={CHART_COLORS.load} />
              <circle cx={pointX} cy={toEnergyY(row.solarProductionKWh)} r="5.5" fill={CHART_COLORS.solar} />
              {hasReserveCoverage ? <circle cx={pointX} cy={toFuelY(row.fuelLiters)} r="5.5" fill={fuelColor} /> : null}
              <text x={pointX} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[13px]">
                {t(`month.${row.month}`)}
              </text>
            </g>
          );
        })}

        <path
          d={loadPath}
          fill="none"
          stroke={CHART_COLORS.load}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={solarPath}
          fill="none"
          stroke={CHART_COLORS.solar}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hasReserveCoverage ? (
          <path d={reservePath} fill="none" stroke={fuelColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {activeIndex !== null && hoverRow && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={top} y2={top + innerHeight} stroke="#94a3b8" strokeDasharray="4 6" />
            <circle cx={hoverX} cy={toEnergyY(hoverRow.loadDemandKWh)} r="7" fill={CHART_COLORS.load} stroke="#fff" strokeWidth="2.5" />
            <circle cx={hoverX} cy={toEnergyY(hoverRow.solarProductionKWh)} r="7" fill={CHART_COLORS.solar} stroke="#fff" strokeWidth="2.5" />
            {hasReserveCoverage ? (
              <circle cx={hoverX} cy={toFuelY(hoverRow.fuelLiters)} r="7" fill={fuelColor} stroke="#fff" strokeWidth="2.5" />
            ) : null}

            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipW}
              height={tooltipH}
              rx="10"
              fill="white"
              stroke="#e2e8f0"
              strokeWidth="1.5"
            />
            <text x={tooltipX + 14} y={tooltipY + 24} fontSize="14" fontWeight="700" fill="#0f172a">
              {hoverRow.label}
            </text>
            <circle cx={tooltipX + 14} cy={tooltipY + 46} r="5" fill={CHART_COLORS.load} />
            <text x={tooltipX + 26} y={tooltipY + 50} fontSize="13" fill="#334155">
              {`${t("charts.load")}: ${formatNumber(hoverRow.loadDemandKWh, 2)} kWh`}
            </text>
            <circle cx={tooltipX + 14} cy={tooltipY + 68} r="5" fill={CHART_COLORS.solar} />
            <text x={tooltipX + 26} y={tooltipY + 72} fontSize="13" fill="#334155">
              {`${t("charts.solarProduction")}: ${formatNumber(hoverRow.solarProductionKWh, 2)} kWh`}
            </text>
            <circle cx={tooltipX + 14} cy={tooltipY + 90} r="5" fill={hoverRow.energyBalanceKWh >= 0 ? CHART_COLORS.positiveBalance : CHART_COLORS.negativeBalance} />
            <text x={tooltipX + 26} y={tooltipY + 94} fontSize="13" fill="#334155">
              {`${t("charts.energyBalance")}: ${formatNumber(hoverRow.energyBalanceKWh, 2)} kWh`}
            </text>
            {hasReserveCoverage ? (
              <>
                <circle cx={tooltipX + 14} cy={tooltipY + 112} r="5" fill={fuelColor} />
                <text x={tooltipX + 26} y={tooltipY + 116} fontSize="13" fill="#334155">
                  {`${fuelLabel}: ${formatNumber(hoverRow.fuelLiters, 2)} l`}
                </text>
              </>
            ) : null}
          </g>
        )}
      </svg>

      <div className="mt-3 space-y-2" style={{ paddingLeft: `${(left / width) * 100}%` }}>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-950">
          <span className="inline-flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: CHART_COLORS.load }} /> {t("charts.load")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: CHART_COLORS.solar }} /> {t("charts.solarProduction")}
          </span>
          {hasReserveCoverage ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: fuelColor }} /> {`${fuelLabel} (l)`}
            </span>
          ) : null}
        </div>
      </div>
    </ChartCard>
  );
}

export function BalanceBarChart({ rows }: { rows: MonthlyEnergyBalanceRow[] }) {
  const { t } = useLanguage();
  if (rows.length === 0) {
    return (
      <ChartCard title={t("charts.energyBalance")}>
        <EmptyChart text={t("charts.fillSystemDataMonthly")} />
      </ChartCard>
    );
  }

  const maxAbsValue = Math.max(...rows.map((row) => Math.abs(row.energyBalanceKWh)), 1);
  const width = 1040;
  const left = 52;
  const right = 52;
  const innerWidth = width - left - right;
  const rawMaxPositive = Math.max(...rows.map((row) => Math.max(row.energyBalanceKWh, 0)), 0);
  const rawMaxNegative = Math.max(...rows.map((row) => Math.max(-row.energyBalanceKWh, 0)), 0);
  const maxPositive = getNiceAxisLimit(rawMaxPositive);
  const maxNegative = getNiceAxisLimit(rawMaxNegative);
  const hasPositive = rawMaxPositive > 0;
  const hasNegative = rawMaxNegative > 0;
  const zeroY =
    hasPositive && hasNegative
      ? 26 + (maxPositive / (maxPositive + maxNegative)) * 192
      : hasPositive
        ? 218
        : 26;
  const positiveHeight = Math.max(0, zeroY - 26);
  const negativeHeight = Math.max(0, 218 - zeroY);
  const stepX = innerWidth / rows.length;
  const barWidth = Math.min(44, Math.max(18, stepX * 0.72));
  const positiveTickValues = hasPositive ? getAxisTicks(maxPositive) : [];
  const negativeTickValues = hasNegative ? getAxisTicks(maxNegative) : [];

  function renderAxisTick(y: number, value: number, key: string) {
    return (
      <g key={key}>
        <line
          x1={left}
          x2={width - right}
          y1={y}
          y2={y}
          stroke="#e2e8f0"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
        <text x={left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[13px]">
          {formatNumber(value, 0)}
        </text>
      </g>
    );
  }

  return (
    <ChartCard
      title={t("charts.energyBalance")}
      helper={t("charts.energyBalanceHelper")}
    >
      <div className="space-y-1.5 md:hidden">
        {rows.map((row) => {
          const isPositive = row.energyBalanceKWh >= 0;
          const barPercent = (Math.abs(row.energyBalanceKWh) / maxAbsValue) * 50;
          return (
            <div key={row.month} className="flex items-center gap-0">
              <span className="w-9 shrink-0 text-right text-sm font-semibold text-slate-500">
                {t(`month.${row.month}`)}
              </span>
              <div className="relative mx-2 flex h-6 flex-1 items-center">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                {isPositive ? (
                  <div
                    className="absolute left-1/2 h-full rounded-r-md"
                    style={{
                      width: `${Math.max(barPercent, 1)}%`,
                      backgroundColor: CHART_COLORS.positiveBalance
                    }}
                  />
                ) : (
                  <div
                    className="absolute right-1/2 h-full rounded-l-md"
                    style={{
                      width: `${Math.max(barPercent, 1)}%`,
                      backgroundColor: CHART_COLORS.negativeBalance
                    }}
                  />
                )}
              </div>
              <span className={`w-16 shrink-0 text-right text-sm font-bold ${isPositive ? "text-brand-700" : "text-rose-600"}`}>
                {formatNumber(row.energyBalanceKWh)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <svg viewBox={`0 0 ${width} 260`} className="block h-auto w-full overflow-visible">
          <text
            x={6}
            y={(26 + 218) / 2}
            textAnchor="middle"
            transform={`rotate(-90, 6, ${(26 + 218) / 2})`}
            className="fill-slate-950 text-[13px] font-semibold"
          >
            {t("charts.energyAxis")}
          </text>
          {positiveTickValues.map((value) => renderAxisTick(zeroY - (value / maxPositive) * positiveHeight, value, `pos-${value}`))}
          {negativeTickValues.map((value) => renderAxisTick(zeroY + (value / maxNegative) * negativeHeight, -value, `neg-${value}`))}
          <line x1={left} x2={width - right} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth="1.5" />
          <text x={left - 8} y={zeroY + 4} textAnchor="end" className="fill-slate-500 text-[13px]">
            0
          </text>

          {rows.map((row, index) => {
            const x = left + index * stepX + (stepX - barWidth) / 2;
            const isPositive = row.energyBalanceKWh >= 0;
            const barHeight = isPositive
              ? maxPositive > 0
                ? (Math.abs(row.energyBalanceKWh) / maxPositive) * positiveHeight
                : 0
              : maxNegative > 0
                ? (Math.abs(row.energyBalanceKWh) / maxNegative) * negativeHeight
                : 0;

            return (
              <g key={row.month}>
                <rect
                  x={x}
                  y={isPositive ? zeroY - barHeight : zeroY}
                  width={barWidth}
                  height={Math.max(barHeight, 2)}
                  rx="6"
                  fill={isPositive ? CHART_COLORS.positiveBalance : CHART_COLORS.negativeBalance}
                />
                <text x={left + index * stepX + stepX / 2} y={250} textAnchor="middle" className="fill-slate-500 text-[13px]">
                  {t(`month.${row.month}`)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-950" style={{ paddingLeft: `${(left / width) * 100}%` }}>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: CHART_COLORS.negativeBalance }} /> {t("charts.deficit")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: CHART_COLORS.positiveBalance }} /> {t("charts.surplus")}
        </span>
      </div>
    </ChartCard>
  );
}

export function CostComparisonChart({
  items
}: {
  items: CostComparisonItem[];
}) {
  const { t } = useLanguage();

  if (items.length === 0) {
    return <EmptyChart text={t("charts.fillCostData")} />;
  }

  const maxValue = Math.max(...items.map((item) => item.toc), 1);

  return (
    <>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.source}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-950">{item.source}</span>
              <span className="text-slate-950">{formatNumber(item.toc)} kr</span>
            </div>
            <div className="h-4 rounded-full bg-slate-100">
              <div
                className="h-4 rounded-full"
                style={{
                  backgroundColor: item.source === "Brenselcelle" ? CHART_COLORS.methanol : CHART_COLORS.diesel,
                  width: `${Math.max(8, (item.toc / maxValue) * 100)}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
