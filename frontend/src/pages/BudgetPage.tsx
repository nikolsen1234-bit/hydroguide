import { useMemo } from "react";
import { NumberField, TextField } from "../components/FormFields";
import WorkspaceActions from "../components/WorkspaceActions";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import { workspaceMetaClassName, workspacePageClassName, workspaceSecondaryButtonClassName } from "../styles/workspace";
import { formatNumber } from "../utils/format";
import { calculateConfigurationOutputs } from "../utils/systemResults";
import { validateConfiguration } from "../utils/validation";

type BudgetUnit = "wh" | "ah";

export default function BudgetPage() {
  const { t, language } = useLanguage();
  const {
    activeDraft,
    resetDraft,
    updateConfigSectionField,
    updateEquipmentRow,
    addEquipmentRow,
    removeEquipmentRow,
    saveDraftMetadata
  } = useConfigurationContext();
  const outputs = useMemo(() => calculateConfigurationOutputs(activeDraft), [activeDraft]);
  const errors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);

  const displayUnit = activeDraft.equipmentBudgetSettings.displayUnit;
  const dailyUnitLabel = `${displayUnit === "ah" ? "Ah" : "Wh"}/${t("budget.perDay")}`;
  const canShowDailyConsumption = displayUnit !== "ah" || Number(activeDraft.battery.nominalVoltage) > 0;
  const getRowDailyValue = (row: (typeof outputs.derivedResults.equipmentBudgetRows)[number]) =>
    displayUnit === "ah" ? row.ahPerDay : row.whPerDay;
  const formatConsumption = (row: (typeof outputs.derivedResults.equipmentBudgetRows)[number]) =>
    canShowDailyConsumption ? `${formatNumber(getRowDailyValue(row))} ${dailyUnitLabel}` : t("overview.notCalculated");
  const totalPerDay =
    canShowDailyConsumption && outputs.derivedResults.equipmentBudgetRows.reduce((sum, row) => sum + getRowDailyValue(row), 0);

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("budget.title")} />

      <WorkspaceSection title={t("budget.equipmentListTitle")}>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={addEquipmentRow} className={workspaceSecondaryButtonClassName}>
              {t("budget.addRow")}
            </button>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {[
                { value: "wh" as BudgetUnit, label: "Wh" },
                { value: "ah" as BudgetUnit, label: "Ah" }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateConfigSectionField("equipmentBudgetSettings", "displayUnit", option.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    displayUnit === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-950 hover:text-slate-950"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden overflow-hidden md:block">
          <table className="w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead>
              <tr className={`text-left ${workspaceMetaClassName} text-slate-950`}>
                <th className="w-20 px-4 py-2">{t("budget.active")}</th>
                <th className="w-[34%] px-4 py-2">{t("budget.equipment")}</th>
                <th className="w-[16%] px-4 py-2">{t("budget.power")}</th>
                <th className="w-[16%] px-4 py-2">{t("budget.hoursPerDay")}</th>
                <th className="w-[18%] px-4 py-2" />
                <th className="w-20 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {outputs.derivedResults.equipmentBudgetRows.map((row, index) => {
                const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);

                return (
                  <tr key={row.id} className={!row.active ? "bg-slate-50/70" : undefined}>
                    <td className="px-4 py-3 align-middle">
                      <button
                        type="button"
                        onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                        className={`inline-flex min-h-10 items-center justify-center rounded-full px-3 py-1 text-sm font-semibold transition ${
                          row.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-950 hover:bg-slate-300"
                        }`}
                      >
                        {row.active ? t("budget.on") : t("budget.off")}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <TextField
                        label=" "
                        ariaLabel={`${t("budget.equipment")} ${index + 1}`}
                        value={row.name}
                        error={errors[`equipmentRows.${row.id}.name`]}
                        onChange={(next) => updateEquipmentRow(row.id, "name", next)}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <NumberField
                        label=" "
                        ariaLabel={`${t("budget.power")} ${index + 1}`}
                        unit="W"
                        value={sourceRow?.powerW ?? ""}
                        error={errors[`equipmentRows.${row.id}.powerW`]}
                        min={0}
                        step={0.1}
                        onChange={(next) => updateEquipmentRow(row.id, "powerW", next)}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <NumberField
                        label=" "
                        ariaLabel={`${t("budget.hoursPerDay")} ${index + 1}`}
                        unit="h"
                        value={sourceRow?.runtimeHoursPerDay ?? ""}
                        error={errors[`equipmentRows.${row.id}.runtimeHoursPerDay`]}
                        min={0}
                        max={24}
                        step={0.1}
                        onChange={(next) => updateEquipmentRow(row.id, "runtimeHoursPerDay", next)}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="flex min-h-10 items-center font-medium text-slate-950">{formatConsumption(row)}</p>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <button
                        type="button"
                        onClick={() => removeEquipmentRow(row.id)}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        {t("budget.delete")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 md:hidden">
          {outputs.derivedResults.equipmentBudgetRows.map((row) => {
            const sourceRow = activeDraft.equipmentRows.find((item) => item.id === row.id);

            return (
              <div key={row.id} className={`rounded-2xl border border-slate-200 p-4 ${!row.active ? "bg-slate-50/70" : ""}`}>
                <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                  <button
                    type="button"
                    onClick={() => updateEquipmentRow(row.id, "active", !row.active)}
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold transition ${
                      row.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-950 hover:bg-slate-300"
                    }`}
                  >
                    {row.active ? t("budget.on") : t("budget.off")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeEquipmentRow(row.id)}
                    className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    {t("budget.delete")}
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  <TextField
                    label={t("budget.equipment")}
                    value={row.name}
                    error={errors[`equipmentRows.${row.id}.name`]}
                    onChange={(next) => updateEquipmentRow(row.id, "name", next)}
                  />
                  <NumberField
                    label={t("budget.power")}
                    unit="W"
                    value={sourceRow?.powerW ?? ""}
                    error={errors[`equipmentRows.${row.id}.powerW`]}
                    min={0}
                    step={0.1}
                    onChange={(next) => updateEquipmentRow(row.id, "powerW", next)}
                  />
                  <NumberField
                    label={t("budget.hoursPerDayMobile")}
                    unit="h"
                    value={sourceRow?.runtimeHoursPerDay ?? ""}
                    error={errors[`equipmentRows.${row.id}.runtimeHoursPerDay`]}
                    min={0}
                    max={24}
                    step={0.1}
                    onChange={(next) => updateEquipmentRow(row.id, "runtimeHoursPerDay", next)}
                  />
                  <p className="text-sm font-medium text-slate-950">
                    {formatConsumption(row)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-start sm:justify-end">
          <div className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-950 shadow-sm sm:w-auto sm:text-left">
            {`${t("budget.dailyConsumption")} ${
              canShowDailyConsumption ? `${formatNumber(totalPerDay as number)} ${dailyUnitLabel}` : t("overview.notCalculated")
            }`}
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceActions onReset={resetDraft} onSave={saveDraftMetadata} />
    </main>
  );
}
