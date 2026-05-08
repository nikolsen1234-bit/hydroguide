import { Fragment, useEffect, useMemo, useState } from "react";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceInputClassName,
  workspaceMetaClassName,
  workspacePageClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";
import type { EditableNumber, EquipmentRow } from "../types";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

type ComponentUnit = "wh" | "ah";
const componentRowSeparatorClassName = "border-b border-[var(--hg-hairline)]";

function toNumber(value: EditableNumber): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function StatusPill({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hg-mono inline-flex h-7 min-w-[58px] items-center justify-center gap-2 rounded-full border px-3 text-[11px] font-[var(--hg-type-weight-bold)] transition ${
        active
          ? "border-emerald-700 bg-emerald-50 text-emerald-700"
          : "border-[var(--hg-hairline)] bg-[var(--hg-surface-2)] text-[var(--hg-ink-2)]"
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {label}
    </button>
  );
}

function UnitToggle({
  value,
  selected,
  onClick
}: {
  value: ComponentUnit;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`hg-mono h-[30px] min-w-[62px] rounded-md border px-3 text-[11px] font-[var(--hg-type-weight-bold)] uppercase transition ${
        selected
          ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
          : "border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[var(--hg-ink)] hover:border-[var(--hg-accent-2)]"
      }`}
    >
      {value}
    </button>
  );
}

function InlineTextField({
  label,
  value,
  onChange,
  className = ""
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={workspaceMetaClassName}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-8 w-full border-0 border-b border-[var(--hg-hairline)] bg-transparent px-1 text-[13px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none transition focus:border-[var(--hg-accent-2)]"
      />
    </label>
  );
}

function InlineNumberField({
  label,
  unit,
  value,
  min = 0,
  max,
  error,
  onChange,
  className = ""
}: {
  label: string;
  unit: string;
  value: EditableNumber;
  min?: number;
  max?: number;
  error?: string;
  onChange: (value: EditableNumber) => void;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={workspaceMetaClassName}>{label}</span>
      <span className="mt-1 grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--hg-hairline)] px-1 transition focus-within:border-[var(--hg-accent-2)]">
        <input
          type="text"
          inputMode="decimal"
          value={value === "" ? "" : String(value)}
          aria-invalid={error ? true : undefined}
          title={error}
          onChange={(event) => {
            const normalized = event.target.value.replace(",", ".");
            if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
              return;
            }
            if (normalized === "") {
              onChange("");
              return;
            }
            if (normalized === "." || normalized.endsWith(".")) {
              return;
            }
            const numericValue = Number(normalized);
            if (Number.isNaN(numericValue)) {
              return;
            }
            if ((min !== undefined && numericValue < min) || (max !== undefined && numericValue > max)) {
              onChange(numericValue);
              return;
            }
            onChange(numericValue);
          }}
          className="hg-mono min-w-0 border-0 bg-transparent p-0 text-[13px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none"
        />
        <span className="hg-mono text-[10px] font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]">{unit}</span>
      </span>
    </label>
  );
}

function DetailRow({
  sourceRow,
  updateEquipmentRow,
  errors
}: {
  sourceRow: EquipmentRow;
  updateEquipmentRow: <K extends keyof EquipmentRow>(id: string, key: K, value: EquipmentRow[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <tr data-component-edit-row>
      <td className="border-b border-[var(--hg-hairline-2)] py-0" colSpan={6}>
        <div className="border-l-2 border-[var(--hg-accent-2)] bg-[var(--hg-surface-2)] px-4 py-4">
          <div className="grid gap-x-4 gap-y-3 lg:grid-cols-[1.45fr_0.72fr_0.72fr_0.72fr_0.72fr_0.9fr_1.45fr]">
            <InlineTextField
              label="Namn"
              value={sourceRow.name}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "name", next)}
            />
            <InlineNumberField
              label="Effekt"
              unit="W"
              value={sourceRow.powerW}
              error={errors[`equipmentRows.${sourceRow.id}.powerW`]}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "powerW", next)}
            />
            <InlineNumberField
              label="Drift"
              unit="t/d"
              value={sourceRow.runtimeHoursPerDay}
              max={24}
              error={errors[`equipmentRows.${sourceRow.id}.runtimeHoursPerDay`]}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "runtimeHoursPerDay", next)}
            />
            <InlineNumberField
              label="Innkjøp"
              unit="kr"
              value={sourceRow.purchaseCost}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "purchaseCost", next)}
            />
            <InlineNumberField
              label="Levetid"
              unit="år"
              value={sourceRow.lifetimeYears}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "lifetimeYears", next)}
            />
            <InlineNumberField
              label="Vedlikehald"
              unit="kr/år"
              value={sourceRow.annualMaintenance}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "annualMaintenance", next)}
            />
            <InlineTextField
              label="Leverandør"
              value={sourceRow.supplier}
              onChange={(next) => updateEquipmentRow(sourceRow.id, "supplier", next)}
            />
          </div>
          <label className="mt-3 block">
            <span className={workspaceMetaClassName}>Kommentar</span>
            <textarea
              value={sourceRow.comment}
              onChange={(event) => updateEquipmentRow(sourceRow.id, "comment", event.target.value)}
              className="mt-1 min-h-[54px] w-full resize-y border-0 border-b border-[var(--hg-hairline)] bg-transparent px-1 py-2 text-[13px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none transition focus:border-[var(--hg-accent-2)]"
            />
          </label>
        </div>
      </td>
    </tr>
  );
}

function SummaryItem({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-[var(--hg-hairline)] px-4 py-2 last:border-r-0">
      <p className={workspaceMetaClassName}>{label}</p>
      <p className="text-[22px] font-[var(--hg-type-weight-extra)] leading-none tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-ink)]">
        {value}
        {unit ? <span className="hg-mono ml-1 text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-normal">{unit}</span> : null}
      </p>
    </div>
  );
}

export default function ComponentsPage() {
  const { t, language } = useLanguage();
  const {
    activeDraft,
    updateConfigSectionField,
    updateEquipmentRow,
    addEquipmentRow,
    removeEquipmentRow,
    saveDraftMetadata
  } = useConfigurationContext();
  const outputs = useMemo(() => calculateConfigurationOutputs(activeDraft), [activeDraft]);
  const errors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);
  const rows = outputs.derivedResults.equipmentBudgetRows;
  const [editingRowId, setEditingRowId] = useState<string | null>(() => activeDraft.equipmentRows[0]?.id ?? null);
  const displayUnit = activeDraft.equipmentBudgetSettings.displayUnit;
  const dailyUnitLabel = `${displayUnit === "ah" ? "Ah" : "Wh"} / døgn`;
  const canShowAh = Number(activeDraft.battery.nominalVoltage) > 0;
  const canShowDailyConsumption = displayUnit !== "ah" || canShowAh;
  const activeCount = rows.filter((row) => row.active).length;
  const peakPower = rows.reduce((sum, row) => sum + (row.active ? row.powerW : 0), 0);
  const totalWhPerDay = rows.reduce((sum, row) => sum + row.whPerDay, 0);
  const totalAhPerDay = rows.reduce((sum, row) => sum + row.ahPerDay, 0);
  const purchaseSum = activeDraft.equipmentRows.reduce((sum, row) => sum + toNumber(row.purchaseCost), 0);

  useEffect(() => {
    if (!editingRowId) {
      return;
    }

    const closeOnClickAway = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest("[data-component-edit-row]")) {
        return;
      }
      setEditingRowId(null);
    };

    document.addEventListener("pointerdown", closeOnClickAway);
    return () => document.removeEventListener("pointerdown", closeOnClickAway);
  }, [editingRowId]);

  const formatConsumption = (row: (typeof rows)[number]) => {
    const unit = displayUnit === "ah" ? "Ah" : "Wh";
    if (!canShowDailyConsumption) {
      return `- ${unit}`;
    }

    return `${formatNumber(displayUnit === "ah" ? row.ahPerDay : row.whPerDay)} ${unit}`;
  };

  const handleAddRow = () => {
    addEquipmentRow();
  };

  const handleRemoveRow = (rowId: string) => {
    removeEquipmentRow(rowId);
    setEditingRowId((current) => (current === rowId ? null : current));
  };

  const headerActions = (
    <>
      <button
        type="button"
        onClick={saveDraftMetadata}
        className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 text-[13px] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)] transition hover:border-[var(--hg-accent-2)]"
      >
        Importer
      </button>
      <button
        type="button"
        onClick={saveDraftMetadata}
        className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--hg-accent)] px-4 text-[13px] font-[var(--hg-type-weight-bold)] text-white transition hover:bg-[var(--hg-accent-2)]"
      >
        BOM-rapport
      </button>
    </>
  );

  return (
    <main className={`${workspacePageClassName} flex min-h-full flex-col`}>
      <WorkspaceHeader title={t("components.title")} actions={headerActions} />

      <section className="grid grid-cols-2 gap-0 border-y border-[var(--hg-hairline)] md:grid-cols-5">
        <SummaryItem label="Aktive einingar" value={`${activeCount}`} unit={`/ ${rows.length}`} />
        <SummaryItem label="Toppeffekt" value={formatNumber(peakPower)} unit="W" />
        <SummaryItem label="Total - Wh/døgn" value={formatNumber(totalWhPerDay)} unit="Wh" />
        <SummaryItem label="Total - Ah/døgn" value={canShowAh ? formatNumber(totalAhPerDay) : "-"} unit="Ah" />
        <SummaryItem label="Innkjøp - sum" value={formatNumber(purchaseSum)} unit="kr" />
      </section>

      <section className="flex flex-1 flex-col border-t-[3px] border-[var(--hg-ink)] pt-3">
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="pt-4">
            <h2 className={`${workspaceSectionTitleClassName} uppercase`}>Effektbudsjett</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Vis forbruk som">
              {(["wh", "ah"] as const).map((option) => (
                <UnitToggle
                  key={option}
                  value={option}
                  selected={displayUnit === option}
                  onClick={() => updateConfigSectionField("equipmentBudgetSettings", "displayUnit", option)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddRow}
              className="h-[30px] rounded-md bg-[var(--hg-accent)] px-4 text-[12px] font-[var(--hg-type-weight-bold)] text-white transition hover:bg-[var(--hg-accent-2)]"
            >
              + Legg til
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border-y border-[var(--hg-hairline)] py-16">
            <div className="max-w-sm text-center">
              <p className="text-[16px] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">Ingen komponenter</p>
              <button
                type="button"
                onClick={handleAddRow}
                className="mt-4 h-9 rounded-md bg-[var(--hg-accent)] px-4 text-[13px] font-[var(--hg-type-weight-bold)] text-white"
              >
                + Legg til
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden flex-1 overflow-x-auto md:block">
              <table className="w-full min-w-[880px] table-fixed border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className={`text-left ${workspaceMetaClassName}`}>
                    <th className={`w-20 ${componentRowSeparatorClassName} px-0 py-2`}>Aktiv</th>
                    <th className={`w-[38%] ${componentRowSeparatorClassName} px-0 py-2`}>Utstyr</th>
                    <th className={`w-28 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>Effekt</th>
                    <th className={`w-28 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>Drift</th>
                    <th className={`w-32 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>{dailyUnitLabel}</th>
                    <th className={`w-24 ${componentRowSeparatorClassName} px-0 py-2 text-right`} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);
                    if (!sourceRow) {
                      return null;
                    }
                    const editing = editingRowId === row.id;
                    const displayName = sourceRow.name.trim() || "Nytt utstyr";

                    return (
                      <Fragment key={row.id}>
                        <tr
                          data-component-edit-row
                          onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}
                          className={`cursor-pointer align-middle transition ${editing ? "bg-[var(--hg-surface-2)]" : "hover:bg-[var(--hg-surface-2)]"}`}
                        >
                          <td className={`${componentRowSeparatorClassName} px-0 py-3 align-middle`} onClick={(event) => event.stopPropagation()}>
                            <StatusPill
                              active={row.active}
                              label={row.active ? t("components.on") : t("components.off")}
                              onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                            />
                          </td>
                          <td className={`${componentRowSeparatorClassName} px-0 py-3 pr-4 align-middle font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]`}>
                            {displayName}
                          </td>
                          <td className={`hg-mono ${componentRowSeparatorClassName} px-0 py-3 text-right align-middle font-[var(--hg-type-weight-bold)]`}>
                            {formatNumber(row.powerW)} W
                          </td>
                          <td className={`hg-mono ${componentRowSeparatorClassName} px-0 py-3 text-right align-middle font-[var(--hg-type-weight-bold)]`}>
                            {formatNumber(row.runtimeHoursPerDay)} t
                          </td>
                          <td className={`hg-mono ${componentRowSeparatorClassName} px-0 py-3 text-right align-middle font-[var(--hg-type-weight-bold)]`}>
                            {formatConsumption(row)}
                          </td>
                          <td className={`${componentRowSeparatorClassName} px-0 py-3 text-right align-middle`} onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-[11px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.08em] text-rose-700 transition hover:bg-rose-100"
                            >
                              Slett
                            </button>
                          </td>
                        </tr>
                        {editing ? <DetailRow sourceRow={sourceRow} updateEquipmentRow={updateEquipmentRow} errors={errors} /> : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {rows.map((row) => {
                const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);
                if (!sourceRow) {
                  return null;
                }
                const editing = editingRowId === row.id;

                return (
                  <article key={row.id} data-component-edit-row className={`${componentRowSeparatorClassName} pb-3`}>
                    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <StatusPill
                        active={row.active}
                        label={row.active ? t("components.on") : t("components.off")}
                        onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}
                        className="min-w-0 truncate text-left font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]"
                      >
                        {sourceRow.name.trim() || "Nytt utstyr"}
                      </button>
                      <span className="hg-mono text-[12px] font-[var(--hg-type-weight-bold)]">{formatConsumption(row)}</span>
                    </div>
                    {editing ? (
                      <div className="border-l-2 border-[var(--hg-accent-2)] bg-[var(--hg-surface-2)] p-3">
                        <div className="grid gap-3">
                          <InlineTextField label="Namn" value={sourceRow.name} onChange={(next) => updateEquipmentRow(sourceRow.id, "name", next)} />
                          <InlineNumberField label="Effekt" unit="W" value={sourceRow.powerW} error={errors[`equipmentRows.${sourceRow.id}.powerW`]} onChange={(next) => updateEquipmentRow(sourceRow.id, "powerW", next)} />
                          <InlineNumberField label="Drift" unit="t/d" value={sourceRow.runtimeHoursPerDay} max={24} error={errors[`equipmentRows.${sourceRow.id}.runtimeHoursPerDay`]} onChange={(next) => updateEquipmentRow(sourceRow.id, "runtimeHoursPerDay", next)} />
                          <InlineNumberField label="Innkjøp" unit="kr" value={sourceRow.purchaseCost} onChange={(next) => updateEquipmentRow(sourceRow.id, "purchaseCost", next)} />
                          <InlineNumberField label="Levetid" unit="år" value={sourceRow.lifetimeYears} onChange={(next) => updateEquipmentRow(sourceRow.id, "lifetimeYears", next)} />
                          <InlineNumberField label="Vedlikehald" unit="kr/år" value={sourceRow.annualMaintenance} onChange={(next) => updateEquipmentRow(sourceRow.id, "annualMaintenance", next)} />
                          <InlineTextField label="Leverandør" value={sourceRow.supplier} onChange={(next) => updateEquipmentRow(sourceRow.id, "supplier", next)} />
                          <label>
                            <span className={workspaceMetaClassName}>Kommentar</span>
                            <textarea
                              value={sourceRow.comment}
                              onChange={(event) => updateEquipmentRow(sourceRow.id, "comment", event.target.value)}
                              className={`${workspaceInputClassName} mt-1 min-h-[72px] resize-y`}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.id)}
                            className="inline-flex h-8 items-center justify-center justify-self-start rounded-md border border-rose-200 bg-rose-50 px-3 text-[11px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.08em] text-rose-700"
                          >
                            Slett
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}

        <div className="hidden">
          <SummaryItem label="Aktive einingar" value={`${activeCount}`} unit={`/ ${rows.length}`} />
          <SummaryItem label="Toppeffekt" value={formatNumber(peakPower)} unit="W" />
          <SummaryItem label="Total - Wh/døgn" value={formatNumber(totalWhPerDay)} unit="Wh" />
          <SummaryItem label="Total - Ah/døgn" value={canShowAh ? formatNumber(totalAhPerDay) : "-"} unit="Ah" />
          <SummaryItem label="Innkjøp - sum" value={formatNumber(purchaseSum)} unit="kr" />
        </div>
      </section>
    </main>
  );
}
