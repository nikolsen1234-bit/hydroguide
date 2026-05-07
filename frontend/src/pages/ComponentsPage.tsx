import { useMemo } from "react";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceContentValueClassName,
  workspaceMetaClassName,
  workspaceInputClassName,
  workspacePageClassName,
  workspacePrimaryButtonClassName,
  workspaceSecondaryButtonClassName
} from "../styles/workspace";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

type ComponentUnit = "wh" | "ah";

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
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-[var(--hg-type-weight-bold)] ${
        active ? "bg-[var(--hg-ok-soft)] text-[var(--hg-ok)]" : "bg-[var(--hg-hairline-2)] text-[var(--hg-muted)]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </button>
  );
}

function CompactTextInput({
  value,
  ariaLabel,
  error,
  onChange
}: {
  value: string;
  ariaLabel: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      aria-invalid={error ? true : undefined}
      title={error}
      onChange={(event) => onChange(event.target.value)}
      className={`${workspaceInputClassName} h-8 rounded-md px-2 py-1`}
    />
  );
}

function CompactNumberInput({
  value,
  unit,
  ariaLabel,
  error,
  min = 0,
  max,
  onChange
}: {
  value: number | "";
  unit: string;
  ariaLabel: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  onChange: (value: number | "") => void;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value === "" ? "" : String(value)}
        aria-label={ariaLabel}
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
        className={`${workspaceInputClassName} h-8 rounded-md px-2 py-1 pr-10`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] font-[var(--hg-type-weight-semibold)] text-[var(--hg-muted)]">
        {unit}
      </span>
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
  const displayUnit = activeDraft.equipmentBudgetSettings.displayUnit;
  const dailyUnitLabel = `${displayUnit === "ah" ? "Ah" : "Wh"} / ${t("components.perDay")}`;
  const canShowDailyConsumption = displayUnit !== "ah" || Number(activeDraft.battery.nominalVoltage) > 0;
  const getRowDailyValue = (row: (typeof rows)[number]) => (displayUnit === "ah" ? row.ahPerDay : row.whPerDay);
  const formatConsumption = (row: (typeof rows)[number]) =>
    canShowDailyConsumption ? formatNumber(getRowDailyValue(row)) : t("overview.notCalculated");
  const totalPerDay = canShowDailyConsumption ? rows.reduce((sum, row) => sum + getRowDailyValue(row), 0) : null;
  const sectionMeta = `${rows.length} rader · ${rows.filter((row) => row.active).length} aktive`;
  const sectionActions = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-[var(--hg-surface-2)] p-0.5">
        {[
          { value: "wh" as ComponentUnit, label: "Wh" },
          { value: "ah" as ComponentUnit, label: "Ah" }
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => updateConfigSectionField("equipmentBudgetSettings", "displayUnit", option.value)}
            className={`rounded-md px-3 py-1 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] transition ${
              displayUnit === option.value ? "bg-[var(--hg-surface)] text-[var(--hg-ink)]" : "text-[var(--hg-muted)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={addEquipmentRow} className={workspaceSecondaryButtonClassName}>
        + {t("components.addRow")}
      </button>
    </div>
  );

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader
        title={t("components.title")}
        actions={
          <button type="button" onClick={saveDraftMetadata} className={workspacePrimaryButtonClassName}>
            {t("shared.save")}
          </button>
        }
      />

      <WorkspaceSection title="Equipment list" description={sectionMeta} actions={sectionActions}>
          {false ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--hg-hairline)] bg-[var(--hg-bg)] p-6 text-center">
              <p className={workspaceContentValueClassName}>Ingen komponenter lagt inn.</p>
              <p className={`mt-1 text-[length:var(--hg-type-content-size)] leading-[var(--hg-type-content-leading)] text-[var(--hg-muted)]`}>
                Legg til første rad for å starte effektbudsjettet.
              </p>
              <button type="button" onClick={addEquipmentRow} className={`mt-4 ${workspacePrimaryButtonClassName}`}>
                {t("components.addRow")}
              </button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] border-collapse text-[length:var(--hg-type-content-size)]">
                  <thead>
                    <tr className={`text-left ${workspaceMetaClassName}`}>
                      <th className="w-20 px-0 py-2">Active</th>
                      <th className="px-0 py-2">{t("components.equipment")}</th>
                      <th className="w-36 px-0 py-2 text-right">{t("components.power")}</th>
                      <th className="w-36 px-0 py-2 text-right">{t("components.hoursPerDay")}</th>
                      <th className="w-36 px-0 py-2 text-right">{dailyUnitLabel}</th>
                      <th className="w-20 px-0 py-2 text-right" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr className="border-t border-[var(--hg-hairline-2)]">
                        <td colSpan={6} className="px-0 py-8 text-center text-[length:var(--hg-type-content-size)] text-[var(--hg-muted)]">
                          Ingen komponenter lagt inn.
                        </td>
                      </tr>
                    ) : rows.map((row, index) => {
                      const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);
                      return (
                        <tr key={row.id} className="border-t border-[var(--hg-hairline-2)] align-top">
                          <td className="px-0 py-2.5">
                            <StatusPill
                              active={row.active}
                              label={row.active ? "ON" : "OFF"}
                              onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                            />
                          </td>
                          <td className="px-0 py-2.5 pr-4">
                            <CompactTextInput
                              ariaLabel={`${t("components.equipment")} ${index + 1}`}
                              value={sourceRow?.name ?? row.name}
                              error={errors[`equipmentRows.${row.id}.name`]}
                              onChange={(next) => updateEquipmentRow(row.id, "name", next)}
                            />
                          </td>
                          <td className="px-0 py-2.5 pl-4">
                            <CompactNumberInput
                              ariaLabel={`${t("components.power")} ${index + 1}`}
                              unit="W"
                              value={sourceRow?.powerW ?? ""}
                              error={errors[`equipmentRows.${row.id}.powerW`]}
                              min={0}
                              step={0.1}
                              onChange={(next) => updateEquipmentRow(row.id, "powerW", next)}
                            />
                          </td>
                          <td className="px-0 py-2.5 pl-4">
                            <CompactNumberInput
                              ariaLabel={`${t("components.hoursPerDay")} ${index + 1}`}
                              unit="h"
                              value={sourceRow?.runtimeHoursPerDay ?? ""}
                              error={errors[`equipmentRows.${row.id}.runtimeHoursPerDay`]}
                              min={0}
                              max={24}
                              step={0.1}
                              onChange={(next) => updateEquipmentRow(row.id, "runtimeHoursPerDay", next)}
                            />
                          </td>
                          <td className="hg-mono px-0 py-3 text-right font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
                            {formatConsumption(row)}
                          </td>
                          <td className="px-0 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeEquipmentRow(row.id)}
                              className="hg-mono text-[10px] font-[var(--hg-type-weight-semibold)] uppercase tracking-[0.1em] text-[var(--hg-muted)] transition hover:text-rose-600"
                            >
                              DELETE
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-[var(--hg-ink)]">
                      <td colSpan={4} className={`${workspaceMetaClassName} px-0 py-3`}>
                        Total daily consumption
                      </td>
                      <td className="hg-mono px-0 py-3 text-right text-[0.97rem] font-[var(--hg-type-weight-bold)] text-[var(--hg-ink)]">
                        {totalPerDay === null ? "-" : formatNumber(totalPerDay)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 md:hidden">
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-[var(--hg-hairline)] p-4 text-[length:var(--hg-type-content-size)] text-[var(--hg-muted)]">
                    Ingen komponenter lagt inn.
                  </div>
                ) : rows.map((row) => {
                  const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);
                  return (
                    <article key={row.id} className="rounded-lg border border-[var(--hg-hairline)] p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <StatusPill
                          active={row.active}
                          label={row.active ? "ON" : "OFF"}
                          onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                        />
                        <button type="button" onClick={() => removeEquipmentRow(row.id)} className="text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-600">
                          {t("components.delete")}
                        </button>
                      </div>
                      <div className="space-y-3">
                        <CompactTextInput
                          ariaLabel={t("components.equipment")}
                          value={sourceRow?.name ?? row.name}
                          error={errors[`equipmentRows.${row.id}.name`]}
                          onChange={(next) => updateEquipmentRow(row.id, "name", next)}
                        />
                        <CompactNumberInput
                          ariaLabel={t("components.power")}
                          unit="W"
                          value={sourceRow?.powerW ?? ""}
                          error={errors[`equipmentRows.${row.id}.powerW`]}
                          min={0}
                          step={0.1}
                          onChange={(next) => updateEquipmentRow(row.id, "powerW", next)}
                        />
                        <CompactNumberInput
                          ariaLabel={t("components.hoursPerDayMobile")}
                          unit="h"
                          value={sourceRow?.runtimeHoursPerDay ?? ""}
                          error={errors[`equipmentRows.${row.id}.runtimeHoursPerDay`]}
                          min={0}
                          max={24}
                          step={0.1}
                          onChange={(next) => updateEquipmentRow(row.id, "runtimeHoursPerDay", next)}
                        />
                        <p className={workspaceContentValueClassName}>{formatConsumption(row)}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
      </WorkspaceSection>
    </main>
  );
}
