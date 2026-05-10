import { workspaceOverlineClassName } from "../styles/workspace";

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

export default function KpiStrip({ items, className }: KpiStripProps): JSX.Element {
  const columnsClass =
    items.length >= 5
      ? "md:grid-cols-5"
      : items.length === 4
        ? "md:grid-cols-4"
        : items.length === 3
          ? "md:grid-cols-3"
          : "md:grid-cols-2";

  return (
    <section className={`hg-kpi-strip grid grid-cols-2 gap-0 border-y border-[var(--hg-hairline)] ${columnsClass} ${className ?? ""}`}>
      {items.map((item, index) => (
        <div
          key={`${item.kicker}-${index}`}
          className="hg-kpi-strip-item flex min-w-0 flex-col gap-1 border-b border-r border-[var(--hg-hairline)] px-4 py-2 even:border-r-0 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
        >
          <span className={`hg-kpi-strip-label ${workspaceOverlineClassName} text-[var(--hg-ink-2)]`}>{item.kicker}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="hg-mono text-[length:var(--hg-type-kpi-size)] font-[var(--hg-type-weight-bold)] leading-none tabular-nums text-[var(--hg-ink)]">{item.value}</span>
            {item.unit ? <span className="hg-mono text-[13px] font-[var(--hg-type-weight-bold)] tracking-normal text-[var(--hg-ink)]">{item.unit}</span> : null}
          </div>
          {item.trend ? (
            <span className="truncate text-[length:var(--hg-type-meta-size)] text-[var(--hg-muted)] max-sm:whitespace-normal max-sm:leading-tight max-sm:[overflow-wrap:anywhere]">
              {item.trend}
            </span>
          ) : null}
        </div>
      ))}
    </section>
  );
}
