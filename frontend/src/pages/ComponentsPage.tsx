import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import KpiStrip, { type KpiStripItem } from "../components/KpiStrip";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceMetaClassName,
  workspacePageClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";
import type { BudgetDisplayUnit, EditableNumber, EquipmentRow } from "../types";
import { openComponentListWindow } from "../utils/componentListReport";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

const componentRowSeparatorClassName = "border-b border-[var(--hg-hairline)]";
const componentTableCellClassName = `${componentRowSeparatorClassName} px-0 py-3 align-middle`;
const componentNumberCellClassName = `hg-mono ${componentTableCellClassName} text-right font-[var(--hg-type-weight-bold)]`;
const componentTextAreaClassName =
  "mt-1 w-full resize-y font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none transition focus:border-[var(--hg-accent-2)]";
const componentDeleteButtonClassName =
  "inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-button-tracking)] text-rose-700";
const componentInputUnderlineClassName = "border-b-2 border-[#98a3b3] focus:border-[var(--hg-accent-2)]";
type UpdateEquipmentRow = <K extends keyof EquipmentRow>(id: string, key: K, value: EquipmentRow[K]) => void;

const equipmentNumberFields = [
  { key: "powerW", label: "Effekt", unit: "W", errorKey: "powerW" },
  { key: "runtimeHoursPerDay", label: "Timer/dag", unit: "timer", errorKey: "runtimeHoursPerDay" }
] as const;

const equipmentPurchaseFields = [
  { key: "purchaseCost", label: "Stykkpris", unit: "kr" }
] as const;

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
      className={`hg-mono inline-flex h-7 min-w-[58px] items-center justify-center gap-2 rounded-full border px-3 text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-bold)] transition ${
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

function UnitSlideToggle({
  value,
  onChange
}: {
  value: BudgetDisplayUnit;
  onChange: (next: BudgetDisplayUnit) => void;
}) {
  const options: BudgetDisplayUnit[] = ["wh", "ah"];
  const activeIndex = options.indexOf(value);
  return (
    <div
      role="radiogroup"
      aria-label="Vis forbruk som"
      className="relative inline-flex h-8 items-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] p-0.5"
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 bottom-0.5 left-0.5 w-16 rounded-[5px] border border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 64}px)` }}
      />
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
              className={`hg-mono relative z-10 h-7 w-16 rounded-[5px] text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-bold)] uppercase transition-colors ${
              selected ? "text-[var(--hg-accent)]" : "text-[var(--hg-ink)]"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function InlineTextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={workspaceMetaClassName}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 h-8 w-full border-0 bg-transparent px-1 text-[length:var(--hg-type-control-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none transition ${componentInputUnderlineClassName}`}
      />
    </label>
  );
}

function InlineNumberField({
  label,
  unit,
  value,
  error,
  onChange
}: {
  label: string;
  unit: string;
  value: EditableNumber;
  error?: string;
  onChange: (value: EditableNumber) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className={workspaceMetaClassName}>{label}</span>
      <span className={`mt-1 grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1 transition focus-within:border-[var(--hg-accent-2)] ${componentInputUnderlineClassName}`}>
        <input
          type="text"
          inputMode="decimal"
          value={value === "" ? "" : String(value)}
          aria-invalid={error ? true : undefined}
          title={error}
          onChange={(event) => {
            const normalized = event.target.value.replace(",", ".");
            if (normalized === "") {
              onChange("");
              return;
            }
            if (!/^(?:\d+|\d*\.\d+)$/.test(normalized)) {
              return;
            }
            const numericValue = Number(normalized);
            if (!Number.isNaN(numericValue)) {
              onChange(numericValue);
            }
          }}
          className="hg-mono min-w-0 border-0 bg-transparent p-0 text-[length:var(--hg-type-control-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] outline-none"
        />
        <span className="hg-mono text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]">{unit}</span>
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
  updateEquipmentRow: UpdateEquipmentRow;
  errors: Record<string, string>;
}) {
  return (
    <tr data-component-edit-row>
      <td className="border-b border-[var(--hg-hairline-2)] py-0" colSpan={6}>
        <div className="border-l-2 border-[var(--hg-accent-2)] bg-[#dde1e7] px-4 py-4">
          <EquipmentDetailFields
            sourceRow={sourceRow}
            updateEquipmentRow={updateEquipmentRow}
            errors={errors}
            layoutClassName="grid gap-x-4 gap-y-3 lg:grid-cols-[1.2fr_0.72fr_0.72fr_1.8fr]"
            purchaseLayoutClassName="mt-3 grid gap-x-4 gap-y-3 lg:grid-cols-[0.72fr_1.8fr]"
            commentClassName={`${componentTextAreaClassName} h-8 min-h-8 resize-none overflow-hidden border-0 bg-transparent px-1 py-1 text-[length:var(--hg-type-control-size)] ${componentInputUnderlineClassName}`}
          />
        </div>
      </td>
    </tr>
  );
}

function EquipmentDetailFields({
  sourceRow,
  updateEquipmentRow,
  errors,
  layoutClassName,
  purchaseLayoutClassName,
  commentClassName,
  commentLabelClassName = "block min-w-0",
  footer
}: {
  sourceRow: EquipmentRow;
  updateEquipmentRow: UpdateEquipmentRow;
  errors: Record<string, string>;
  layoutClassName: string;
  purchaseLayoutClassName: string;
  commentClassName: string;
  commentLabelClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className={layoutClassName}>
        <InlineTextField label="Komponent" value={sourceRow.name} onChange={(next) => updateEquipmentRow(sourceRow.id, "name", next)} />
        {equipmentNumberFields.map((field) => {
          const errorKey = "errorKey" in field ? field.errorKey : undefined;
          return (
            <InlineNumberField
              key={field.key}
              label={field.label}
              unit={field.unit}
              value={sourceRow[field.key]}
              error={errorKey ? errors[`equipmentRows.${sourceRow.id}.${errorKey}`] : undefined}
              onChange={(next) => updateEquipmentRow(sourceRow.id, field.key, next)}
            />
          );
        })}
        <label className={commentLabelClassName}>
          <span className={workspaceMetaClassName}>Beskrivelse</span>
          <textarea
            value={sourceRow.comment}
            onChange={(event) => updateEquipmentRow(sourceRow.id, "comment", event.target.value)}
            className={commentClassName}
          />
        </label>
      </div>
      <div className={purchaseLayoutClassName}>
        {equipmentPurchaseFields.map((field) => (
          <InlineNumberField
            key={field.key}
            label={field.label}
            unit={field.unit}
            value={sourceRow[field.key]}
            onChange={(next) => updateEquipmentRow(sourceRow.id, field.key, next)}
          />
        ))}
        <InlineTextField label="Link" value={sourceRow.supplier} onChange={(next) => updateEquipmentRow(sourceRow.id, "supplier", next)} />
      </div>
      {footer}
    </>
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
  const activeCount = rows.filter((row) => row.active).length;
  const totalWhPerDay = rows.reduce((sum, row) => sum + row.whPerDay, 0);
  const totalAhPerDay = rows.reduce((sum, row) => sum + row.ahPerDay, 0);
  const totalPurchaseCost = activeDraft.equipmentRows.reduce(
    (sum, row) => sum + (row.active && typeof row.purchaseCost === "number" ? row.purchaseCost : 0),
    0
  );
  const componentRows = rows.flatMap((row) => {
    const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);
    return sourceRow ? [{ row, sourceRow, displayName: sourceRow.name.trim() || "Nytt utstyr" }] : [];
  });

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
    if (displayUnit === "ah" && !canShowAh) {
      return `- ${unit}`;
    }

    return `${formatNumber(displayUnit === "ah" ? row.ahPerDay : row.whPerDay)} ${unit}`;
  };

  const handleRemoveRow = (rowId: string) => {
    removeEquipmentRow(rowId);
    setEditingRowId((current) => (current === rowId ? null : current));
  };

  const handleOpenComponentList = () => {
    saveDraftMetadata();
    openComponentListWindow(activeDraft, outputs.derivedResults);
  };

  const headerActions = (
    <>
      <WorkspaceHeaderActionButton
        icon={workspaceHeaderActionIcons.save}
        label="Lagre"
        subLabel="Utkast"
        tone="success"
        onClick={saveDraftMetadata}
      />
      <WorkspaceHeaderActionButton
        icon={workspaceHeaderActionIcons.report}
        label="Komponentliste"
        subLabel="Eksporter"
        tone="warning"
        onClick={handleOpenComponentList}
        primary
      />
    </>
  );

  const componentsKpiItems: KpiStripItem[] = [
    { kicker: "AKTIVE ENHETER", value: `${activeCount}`, unit: `/ ${rows.length}` },
    {
      kicker: "FORBRUK",
      value: displayUnit === "ah" ? (canShowAh ? formatNumber(totalAhPerDay) : "-") : formatNumber(totalWhPerDay),
      unit: displayUnit === "ah" ? "Ah" : "Wh"
    },
    { kicker: "TOTALPRIS", value: formatNumber(totalPurchaseCost, 0), unit: "kr" }
  ];

  return (
    <main className={`${workspacePageClassName} flex min-h-full flex-col`}>
      <WorkspaceHeader title={t("components.title")} actions={headerActions} />

      <KpiStrip items={componentsKpiItems} />

      <section className="flex flex-1 flex-col border-t-[3px] border-[var(--hg-ink)] pt-3">
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="pt-4">
            <h2 className={`${workspaceSectionTitleClassName} uppercase`}>Effektbudsjett</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <UnitSlideToggle
              value={displayUnit}
              onChange={(option) => updateConfigSectionField("equipmentBudgetSettings", "displayUnit", option)}
            />
            <button
              type="button"
              onClick={addEquipmentRow}
              className="hg-mono inline-flex h-9 items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-accent)] transition hover:border-[var(--hg-accent-2)] hover:bg-[var(--hg-accent-soft)]"
            >
              + Legg til
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center border-y border-[var(--hg-hairline)] py-16">
            <div className="max-w-sm text-center">
              <p className="text-[length:var(--hg-type-empty-title-size)] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">Ingen komponenter</p>
              <button
                type="button"
                onClick={addEquipmentRow}
                className="hg-mono mt-4 inline-flex h-9 items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] uppercase tracking-[var(--hg-type-unit-tracking)] text-[var(--hg-accent)] transition hover:border-[var(--hg-accent-2)] hover:bg-[var(--hg-accent-soft)]"
              >
                + Legg til
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden flex-1 overflow-x-auto md:block">
              <table className="w-full min-w-[880px] table-fixed border-separate border-spacing-0 text-[length:var(--hg-type-table-size)]">
                <thead>
                  <tr className={`text-left ${workspaceMetaClassName}`}>
                    <th className={`w-20 ${componentRowSeparatorClassName} px-0 py-2`}>Aktiv</th>
                    <th className={`w-[38%] ${componentRowSeparatorClassName} px-0 py-2`}>Komponent</th>
                    <th className={`w-28 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>Effekt</th>
                    <th className={`w-28 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>Timer/dag</th>
                    <th className={`w-32 ${componentRowSeparatorClassName} px-0 py-2 text-right`}>{dailyUnitLabel}</th>
                    <th className={`w-24 ${componentRowSeparatorClassName} px-0 py-2 text-right`} />
                  </tr>
                </thead>
                <tbody>
                  {componentRows.map(({ row, sourceRow, displayName }) => {
                    const editing = editingRowId === row.id;
                    const inactive = !row.active;
                    const rowBg = editing
                      ? "bg-[var(--hg-surface-2)]"
                      : inactive
                        ? "bg-[#cdd2db] hover:bg-[#c4cad5]"
                        : "hover:bg-[var(--hg-surface-2)]";
                    const dimmedTextCls = inactive ? "opacity-45 [text-decoration:line-through]" : "";

                    return (
                      <Fragment key={row.id}>
                        <tr
                          data-component-edit-row
                          onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}
                          className={`cursor-pointer align-middle transition ${rowBg}`}
                        >
                          <td className={componentTableCellClassName} onClick={(event) => event.stopPropagation()}>
                            <StatusPill
                              active={row.active}
                              label={row.active ? t("components.on") : t("components.off")}
                              onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                            />
                          </td>
                          <td className={`${componentTableCellClassName} pr-4 font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] ${dimmedTextCls}`}>
                            {displayName}
                          </td>
                          {[
                            ["power", `${formatNumber(row.powerW)} W`],
                            ["runtime", `${formatNumber(row.runtimeHoursPerDay)} timer`],
                            ["consumption", formatConsumption(row)]
                          ].map(([key, value]) => (
                            <td key={key} className={`${componentNumberCellClassName} ${dimmedTextCls}`}>{value}</td>
                          ))}
                          <td className={`${componentTableCellClassName} text-right`} onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              className={`${componentDeleteButtonClassName} transition hover:bg-rose-100`}
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
              {componentRows.map(({ row, sourceRow, displayName }) => {
                const editing = editingRowId === row.id;
                const inactive = !row.active;
                const cardBg = inactive ? "bg-[#cdd2db] -mx-2 px-2 rounded-md" : "";
                const dimmedTextCls = inactive ? "opacity-45 [text-decoration:line-through]" : "";

                return (
                  <article key={row.id} data-component-edit-row className={`${componentRowSeparatorClassName} pb-3 ${cardBg}`}>
                    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <StatusPill
                        active={row.active}
                        label={row.active ? t("components.on") : t("components.off")}
                        onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                      />
                      <button
                        type="button"
                        onClick={() => setEditingRowId((current) => (current === row.id ? null : row.id))}
                        className={`min-w-0 truncate text-left font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)] ${dimmedTextCls}`}
                      >
                        {displayName}
                      </button>
                      <span className={`hg-mono text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] ${dimmedTextCls}`}>{formatConsumption(row)}</span>
                    </div>
                    {editing ? (
                      <div className="border-l-2 border-[var(--hg-accent-2)] bg-[#dde1e7] p-3">
                        <div className="grid gap-3">
                          <EquipmentDetailFields
                            sourceRow={sourceRow}
                            updateEquipmentRow={updateEquipmentRow}
                            errors={errors}
                            layoutClassName="grid gap-3"
                            purchaseLayoutClassName="grid gap-3"
                            commentLabelClassName="block"
                            commentClassName={`${componentTextAreaClassName} min-h-[72px] border-0 bg-transparent px-1 py-2 text-[length:var(--hg-type-control-size)] ${componentInputUnderlineClassName}`}
                            footer={
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(row.id)}
                                className={`${componentDeleteButtonClassName} justify-self-start`}
                              >
                                Slett
                              </button>
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
