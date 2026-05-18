export type KpiStripItem = {
  kicker: string;
  value: string;
  unit?: string;
  trend?: string;
};

export type KpiStripProps = {
  items: KpiStripItem[];
  className?: string;
};

const kpiTileClassName =
  "hg-kpi-strip-item flex min-h-[64px] min-w-0 flex-col justify-center gap-1 px-4 py-2";
const kpiLabelClassName =
  "hg-kpi-header";
const kpiValueClassName =
  "hg-mono text-[length:var(--hg-type-kpi-size)] font-[var(--hg-type-weight-bold)] leading-none tabular-nums text-[var(--hg-ink)]";
const kpiUnitClassName =
  "hg-mono text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] leading-none tracking-normal text-[var(--hg-ink)]";

export default function KpiStrip({ items, className }: KpiStripProps): JSX.Element {
  const columnsClass =
    items.length >= 5
      ? "md:grid-cols-5"
      : items.length === 4
        ? "md:grid-cols-4"
        : items.length === 3
          ? "md:grid-cols-3"
          : "md:grid-cols-2";

  const isOdd = items.length % 2 === 1;

  return (
    <section className={`hg-kpi-strip grid grid-cols-2 gap-0 border-y border-[var(--hg-hairline)] ${columnsClass} ${className ?? ""}`}>
      {items.map((item, index) => {
        const isLastOddOnMobile = isOdd && index === items.length - 1;
        return (
          <div
            key={`${item.kicker}-${index}`}
            className={`${kpiTileClassName} ${isLastOddOnMobile ? "max-md:col-span-2" : ""}`}
          >
            <span className={kpiLabelClassName}>{item.kicker}</span>
            <div className="flex items-baseline gap-1.5">
              <span className={kpiValueClassName}>{item.value}</span>
              {item.unit ? <span className={kpiUnitClassName}>{item.unit.toUpperCase()}</span> : null}
            </div>
            {item.trend ? (
              <span className="truncate text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)] max-sm:whitespace-normal max-sm:leading-tight max-sm:[overflow-wrap:anywhere]">
                {item.trend}
              </span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
