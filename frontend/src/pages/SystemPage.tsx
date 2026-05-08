import { useEffect, useRef, useState } from "react";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import { workspacePageClassName } from "../styles/workspace";

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DES"];
const DEFAULT_MONTH_VALUES = [0.4, 1.0, 2.7, 4.2, 5.6, 5.2, 5.1, 4.1, 2.4, 1.2, 0.5, 0.3];

export default function SystemPage() {
  const { saveDraftMetadata } = useConfigurationContext();
  const { t } = useLanguage();

  return (
    <main className={`${workspacePageClassName} hg-tp hg-tp-fullheight flex h-full flex-col gap-3 !pb-3`}>
      <WorkspaceHeader
        title={t("system.title")}
        actions={
          <>
            <WorkspaceHeaderActionButton
              icon={workspaceHeaderActionIcons.reset}
              label="Tilbakestill"
              onClick={() => {}}
            />
            <WorkspaceHeaderActionButton
              icon={workspaceHeaderActionIcons.save}
              label="Lagre"
              onClick={() => saveDraftMetadata()}
              primary
            />
          </>
        }
      />

      <KpiStrip />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <EnergiSeksjon />
        <ReserveSection />
      </div>
    </main>
  );
}

function KpiStrip() {
  return (
    <section className="hg-tp-kpi grid grid-cols-2 gap-0 border-y border-[var(--hg-hairline)] md:grid-cols-4">
      <KpiTile kicker="SOLYTELSE · DØGN" value="0.38" unit="kWh/d" trend="▲ 12 %" />
      <KpiTile kicker="BATTERIKAPASITET" value="1.44" unit="kWh" trend="3 dagar autonomi" />
      <KpiTile kicker="RESERVEBRUK · ÅR" value="3.1" unit="%" trend="▼ 0.4 pp" />
      <KpiTile kicker="CO₂ · ÅR" value="12" unit="kg" trend="Metanol" />
    </section>
  );
}

function KpiTile({ kicker, value, unit, trend }: { kicker: string; value: string; unit: string; trend: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-[var(--hg-hairline)] px-4 py-2 last:border-r-0">
      <span className="hg-mono text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
        {kicker}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="hg-mono text-[22px] font-[var(--hg-type-weight-extra)] leading-none text-[var(--hg-ink)]">
          {value}
        </span>
        <span className="hg-mono text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-ink-2)]">
          {unit}
        </span>
      </div>
      <span className="hg-mono text-[10px] font-[var(--hg-type-weight-medium)] text-[var(--hg-ink-2)]">
        {trend}
      </span>
    </div>
  );
}

function SectionHeader({ title, actions }: { kicker?: string; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
      <div className="min-w-0">
        <h2 className="text-[15px] font-[var(--hg-type-weight-extra)] leading-tight tracking-tight text-[var(--hg-ink)]">
          {title}
        </h2>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function FlatField({
  label,
  value,
  unit,
  hint,
  info,
  highlighted,
}: {
  label: string;
  value?: string;
  unit?: string;
  hint?: string;
  info?: boolean;
  highlighted?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const borderColor = focused
    ? "border-[var(--hg-accent)]"
    : highlighted
      ? "border-[var(--hg-accent)]"
      : "border-[var(--hg-hairline)]";
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={`hg-mono flex items-center gap-1 text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.16em] transition-colors ${focused ? "text-[var(--hg-accent)]" : "text-[var(--hg-ink-2)]"}`}>
        {label}
        {info ? <span className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-[var(--hg-hairline)] text-[8px]">i</span> : null}
      </span>
      <div className={`flex items-baseline gap-2 border-b-2 ${borderColor} pb-0.5 transition-colors`}>
        <input
          type="text"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => setFocused(false)}
          className="hg-mono min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] font-[var(--hg-type-weight-extra)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]"
        />
        {unit ? (
          <span className="hg-mono shrink-0 text-[11px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-ink-2)]">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <span className="hg-mono text-[10px] text-[var(--hg-ink-2)]">{hint}</span> : null}
    </label>
  );
}

function FlatSelect({ label, value, options }: { label: string; value: string; options: string[] }) {
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="hg-mono text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.16em] text-[var(--hg-ink-2)]">
        {label}
      </span>
      <div className={`flex items-center justify-between gap-2 border-b-2 ${focused ? "border-[var(--hg-accent)]" : "border-[var(--hg-hairline)]"} pb-0.5 transition-colors`}>
        <select
          value={v}
          onChange={(e) => setV(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="hg-mono min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[13px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <span className="text-[var(--hg-ink-2)]">▾</span>
      </div>
    </label>
  );
}

function PillToggle({ options, selected, fullWidth = false }: { options: string[]; selected: string; fullWidth?: boolean }) {
  const [active, setActive] = useState(selected);
  return (
    <div
      className={`grid rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-0.5 ${fullWidth ? "w-full" : "inline-grid"}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const isActive = active === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => setActive(opt)}
            className={`hg-mono flex items-center justify-center rounded-[5px] border px-2 py-1.5 text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.14em] transition ${
              isActive
                ? "border-[var(--hg-accent)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                : "border-transparent text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function EnergiSeksjon() {
  const [values, setValues] = useState<number[]>(DEFAULT_MONTH_VALUES);
  const [panelOpen, setPanelOpen] = useState(false);
  const sum = values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

  return (
    <section className="hg-tp-section flex min-h-0 flex-1 flex-col border-t-2 border-[var(--hg-ink)] pt-2">
      <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
        {/* Solcellesystem felter — sentrert vertikalt for å spegle batteri-blokka */}
        <div className="flex flex-col">
          <SectionHeader title="SOLCELLESYSTEM" />
          <div className="flex flex-1 items-center">
            <div className="grid w-full gap-x-6 gap-y-3 sm:grid-cols-2">
              <FlatField label="PANELEFFEKT" value="420" unit="Wp" />
              <FlatField label="ANTALL" value="12" unit="stk" />
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="hg-mono flex h-full min-h-8 items-end justify-start pb-1 text-[11px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-accent)]"
              >
                Rediger månadsverdiar
              </button>
              <FlatField label="VIRK.GRAD" value="0.85" unit="0-1" />
            </div>
          </div>
        </div>

        {/* Batteribank felter */}
        <div>
          <SectionHeader title="BATTERIBANK" />
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-3">
            <FlatField label="DC-SPENNING" value="12" unit="V" />
            <div className="flex flex-col gap-1">
              <span className="hg-mono text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.16em] text-[var(--hg-ink-2)]">
                BATTERITYPE
              </span>
              <PillToggle options={["AGM", "NiMH", "Na-ion", "Li-ion"]} selected="Li-ion" fullWidth />
            </div>
            <div className="flex flex-col gap-1">
              <span className="hg-mono text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.16em] text-[var(--hg-ink-2)]">
                INNGANG
              </span>
              <PillToggle options={["DAGAR", "AH"]} selected="AH" fullWidth />
            </div>
            <FlatField label="BANKSTORLEIK" value="3" unit="Ah" />
            <FlatField label="MAKS DOD" value="0.80" unit="0-1" />
            <FlatField label="ESTIMERT KAPASITET" value="1.44" unit="kWh" info highlighted />
          </div>
        </div>
      </div>

      {/* Grafen — full breidde under */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <p className="hg-mono mb-1 text-[9px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
          MÅNADLEG SOLINNSTRÅLING · KWH/M²
        </p>
        <div className="min-h-0 flex-1">
          <RadiationBarChart values={values} />
        </div>
        <p className="hg-mono mt-1 text-right text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-ink-2)]">
          SUM: {sum.toFixed(2)} KWH/M² · ÅR
        </p>
      </div>

      <MonthlyValuesPanel
        open={panelOpen}
        values={values}
        baseline={DEFAULT_MONTH_VALUES}
        onChange={(i, v) => setValues((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
        onClose={() => setPanelOpen(false)}
        onReset={() => setValues(DEFAULT_MONTH_VALUES)}
      />
    </section>
  );
}

function RadiationBarChart({ values }: { values: number[] }) {
  const rawMax = Math.max(...values);
  const max = rawMax > 0 ? rawMax : 6;
  const niceMax = Math.ceil(max);
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative h-full">
      <div className="pointer-events-none absolute inset-x-0 top-[18px] bottom-[20px]">
        {gridLines.map((g) => (
          <div
            key={g}
            className="absolute inset-x-0 border-t border-[var(--hg-ink-2)]/30"
            style={{ bottom: `${g * 100}%` }}
          >
            <span className="hg-mono absolute -top-[7px] left-0 bg-[var(--hg-bg)] pr-1 text-[10px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
              {(niceMax * g).toFixed(g === 1 ? 0 : 1)}
            </span>
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 border-t-2 border-[var(--hg-ink)]" />
      </div>
      <div className="relative grid h-full grid-cols-12 items-end gap-3">
        {values.map((v, i) => {
          const ratio = v / niceMax;
          const barHeight = `${Math.max(ratio * 100, v > 0 ? 2 : 0)}%`;
          return (
            <div key={i} className="flex h-full flex-col items-center justify-end">
              <span className="hg-mono mb-0.5 text-[10px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
                {v.toFixed(1)}
              </span>
              <div
                className="w-[68%] rounded-[2px]"
                style={{ height: barHeight, minHeight: v > 0 ? 2 : 0, background: "#60a5fa" }}
                aria-label={`${MONTH_LABELS[i]}: ${v.toFixed(1)} kWh/m²`}
              />
              <span className="hg-mono mt-1 text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-ink)]">
                {MONTH_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FULL_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];

function MonthlyValuesPanel({
  open,
  values,
  baseline,
  onChange,
  onClose,
  onReset,
}: {
  open: boolean;
  values: number[];
  baseline: number[];
  onChange: (index: number, value: number) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => {
        inputsRef.current[0]?.focus();
        inputsRef.current[0]?.select();
      }, 220);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const parseValue = (raw: string): number => {
    const normalized = raw.replace(",", ".").trim();
    if (normalized === "") return 0;
    const n = Number(normalized);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (i < values.length - 1) {
        inputsRef.current[i + 1]?.focus();
        inputsRef.current[i + 1]?.select();
      } else {
        onClose();
      }
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/35 transition-opacity duration-200 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-[520px] flex-col border-l border-[var(--hg-hairline)] bg-[var(--hg-surface)] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Månadsverdiar"
      >
        <header className="flex items-start justify-between border-b border-[var(--hg-hairline)] px-6 py-4">
          <div>
            <p className="hg-mono text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
              MÅNADSVERDIAR
            </p>
            <h2 className="mt-1 text-[18px] font-[var(--hg-type-weight-extra)] tracking-tight text-[var(--hg-ink)]">
              SOL · KWH/M² PER MÅNAD
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--hg-hairline)] text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" strokeWidth="1.8" stroke="currentColor">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-6 border-b border-[var(--hg-hairline)] pb-2">
            <span className="hg-mono text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
              MÅNAD
            </span>
            <span className="hg-mono text-right text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
              KWH/M²
            </span>
            <span className="hg-mono text-right text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
              Δ FRÅ STANDARD
            </span>
          </div>
          {values.map((v, i) => {
            const delta = v - baseline[i];
            const deltaText = delta === 0 ? "0.00" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
            const deltaColor = delta === 0 ? "text-[var(--hg-ink-2)]" : delta > 0 ? "text-emerald-600" : "text-rose-600";
            return (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-6 border-b border-[var(--hg-hairline-2)] py-2">
                <span className="text-[14px] font-[var(--hg-type-weight-medium)] text-[var(--hg-ink)]">
                  {FULL_MONTH_LABELS[i]}
                </span>
                <input
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  value={Number.isFinite(v) ? String(v) : ""}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => onChange(i, parseValue(e.target.value))}
                  onKeyDown={(e) => handleKeyDown(e, i)}
                  className="hg-mono w-full bg-transparent text-right text-[14px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none focus:text-[var(--hg-accent)]"
                  aria-label={`${FULL_MONTH_LABELS[i]} kWh/m²`}
                />
                <span className={`hg-mono text-right text-[12px] font-[var(--hg-type-weight-bold)] ${deltaColor}`}>
                  {deltaText}
                </span>
              </div>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--hg-hairline)] px-6 py-3">
          <button
            type="button"
            onClick={onReset}
            className="hg-mono text-[11px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.12em] text-[var(--hg-ink-2)] hover:text-[var(--hg-ink)]"
          >
            Tilbakestill til standard
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[var(--hg-accent)] px-4 py-2 text-[13px] font-[var(--hg-type-weight-bold)] text-white hover:bg-[var(--hg-accent-2)]"
          >
            Lagre
          </button>
        </footer>
      </aside>
    </>
  );
}

function ReserveSection() {
  return (
    <section className="hg-tp-section border-t-2 border-[var(--hg-ink)] pt-2">
      <SectionHeader
        title="RESERVEKJELDE"
        actions={<PillToggle options={["MED RESERVE", "BERRE SOL + BATTERI"]} selected="MED RESERVE" />}
      />
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-5">
        <FlatSelect label="TYPE KJELDE" value="Metanol brenselcelle" options={["Metanol brenselcelle", "Diesel aggregat"]} />
        <FlatField label="INNKJØP" value="65000" unit="kr" />
        <FlatField label="EFFEKT" value="240" unit="W" />
        <FlatField label="FORBRUK" value="0.85" unit="L/kWh" />
        <FlatField label="DRIVSTOFF" value="39" unit="kr/L" />
      </div>

      <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-5">
        <FlatField label="LEVETID" value="8000" unit="t" />
        <FlatField label="VEDLIKEHALD" value="4000" unit="kr/år" />
        <FlatField label="CO₂-FAKTOR" value="1.37" unit="kg/L" />
      </div>

    </section>
  );
}
