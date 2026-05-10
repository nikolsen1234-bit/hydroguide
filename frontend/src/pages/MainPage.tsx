import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BooleanChoiceField, NumberField } from "../components/FormFields";
import NveStandaloneMap from "../components/NveStandaloneMap";
import WorkspaceHeader, { WorkspaceHeaderActionButton, workspaceHeaderActionIcons } from "../components/WorkspaceHeader";
import EditorialSection from "../components/EditorialSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import { sections } from "../questions";
import {
  workspaceBodyMutedClassName,
  workspaceContentValueClassName,
  workspaceFieldLabelClassName,
  workspaceInputClassName,
  workspacePageClassName,
  workspaceSecondaryButtonClassName,
  workspaceSubsectionTitleClassName
} from "../styles/workspace";
import type { Answers } from "../types";
import { validateConfiguration } from "../utils/validation";

type ProjectBasisQuestion = (typeof sections)[number]["questions"][number];

function isAnswered(value: unknown) {
  return value !== "" && value !== null && value !== undefined;
}

export default function MainPage() {
  const { activeDraft, resetDraft, updateAnswer, updateConfigSectionField, updateConfigurationLocation, saveDraftMetadata } =
    useConfigurationContext();
  const { t, language } = useLanguage();
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const calculatorMode = (activeDraft.engineMode ?? "calculator") === "calculator";
  const validationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);
  const visibleValidationErrors = showValidationErrors ? validationErrors : {};
  const errors = calculatorMode
    ? { "other.evaluationHorizonYears": visibleValidationErrors["other.evaluationHorizonYears"] }
    : visibleValidationErrors;

  const visibleQuestions = sections.flatMap((section) =>
    section.questions.filter((question) => !question.hidden && (!question.condition || question.condition(activeDraft.answers)))
  );
  const completedQuestions = visibleQuestions.filter((question) => isAnswered(activeDraft.answers[question.key])).length;

  const handleSave = () => {
    setShowValidationErrors(true);
    saveDraftMetadata();
  };

  const handleReset = () => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      resetDraft();
    }
  };

  const setQuestionValue = (key: keyof Answers, value: unknown) => {
    updateAnswer(key, value as Answers[keyof Answers]);
  };

  const renderQuestionControl = (question: ProjectBasisQuestion) => {
    const value = activeDraft.answers[question.key];
    const error = errors[question.key];
    const qOptions = question.options?.map((option) => ({
      value: option.value,
      label: option.labelKey ? t(option.labelKey) : option.label
    }));

    if (question.input === "select") {
      return (
        <select
          value={String(value)}
          onChange={(event) => setQuestionValue(question.key, event.target.value)}
          className={`${workspaceInputClassName} h-10 py-1.5 leading-[1.2] text-right hg-mono`}
          aria-invalid={error ? true : undefined}
        >
          <option value="">{t("shared.selectOption")}</option>
          {qOptions?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (question.input === "number") {
      return (
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={value === "" ? "" : String(value)}
            onChange={(event) => {
              const normalized = event.target.value.replace(",", ".");
              if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
                return;
              }

              setQuestionValue(question.key, normalized === "" ? "" : Number(normalized));
            }}
            className={`${workspaceInputClassName} h-9 py-1.5 pr-14 text-right hg-mono`}
            aria-invalid={error ? true : undefined}
          />
          {question.unitKey || question.unit ? (
            <span className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${workspaceFieldLabelClassName}`}>
              {question.unitKey ? t(question.unitKey) : question.unit}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" role="radiogroup" aria-label={question.labelKey ? t(question.labelKey) : question.label}>
        {(["yes", "no"] as const).map((option) => {
          const selected = value === option;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setQuestionValue(question.key, option)}
              className={`h-9 rounded-md border px-3 py-1.5 ${workspaceFieldLabelClassName} transition ${
                selected
                  ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                  : "border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[var(--hg-ink)] hover:border-[var(--hg-accent-2)]"
              }`}
            >
              {option === "yes" ? t("shared.yes") : t("shared.no")}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader
        title={t("main.title")}
        actions={
          <>
            <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.reset} label={t("shared.reset")} subLabel="Tilbakestill" onClick={handleReset} />
            <WorkspaceHeaderActionButton icon={workspaceHeaderActionIcons.save} label={t("shared.save")} subLabel="Lagre utkast" onClick={handleSave} primary />
          </>
        }
      />

      <div className="space-y-4">
        <EditorialSection title="Kildedata" description="Koordinater, NVE-punkt og prosjektidentitet samles før vurderingsspørsmålene.">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-x-8">
                {[
                  ["Prosjekt", activeDraft.name.trim() || t("shared.unnamed")],
                  ["Stasjon", activeDraft.location || "Ikke valgt"],
                  ["NVE-id", activeDraft.locationPlaceId || "Ikke valgt"],
                  [
                    "Koordinater",
                    activeDraft.locationLat !== null && activeDraft.locationLng !== null
                      ? `${activeDraft.locationLat.toFixed(5)}, ${activeDraft.locationLng.toFixed(5)}`
                      : "Ikke valgt"
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--hg-hairline-2)] py-3">
                    <span className={workspaceBodyMutedClassName}>{label}</span>
                    <span className={`hg-mono text-right ${workspaceContentValueClassName}`}>{value}</span>
                  </div>
                ))}
              </div>
              <Link to="/oversikt" className={`${workspaceSecondaryButtonClassName} self-start`}>
                Åpne oversikt
              </Link>
            </div>
            <div className="min-h-[280px] overflow-hidden rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)]">
              <NveStandaloneMap
                value={activeDraft.location}
                lat={activeDraft.locationLat}
                lng={activeDraft.locationLng}
                nveId={activeDraft.locationPlaceId}
                onChange={updateConfigurationLocation}
                showPlantDetails={false}
              />
            </div>
          </div>
        </EditorialSection>

        <EditorialSection title={t("main.operatingAssumptions")} description="Prosjektforutsetninger som brukes videre i anbefaling og kostnadsbilde.">
          <div className="grid gap-4 md:grid-cols-5">
            <NumberField
              label={t("main.evaluationHorizon")}
              unit={t("main.year")}
              value={activeDraft.other.evaluationHorizonYears}
              error={errors["other.evaluationHorizonYears"]}
              min={0}
              step={1}
              onChange={(next) => updateConfigSectionField("other", "evaluationHorizonYears", next)}
            />
            {!calculatorMode && (
              <>
                <NumberField
                  label={t("main.inspectionsPerYear")}
                  unit={t("main.perYear")}
                  value={activeDraft.systemParameters.inspectionsPerYear}
                  error={errors["systemParameters.inspectionsPerYear"]}
                  min={0}
                  step={1}
                  onChange={(next) => updateConfigSectionField("systemParameters", "inspectionsPerYear", next)}
                />
                <BooleanChoiceField
                  label={t("main.4gCoverage")}
                  value={activeDraft.systemParameters["4gCoverage"]}
                  error={errors["systemParameters.4gCoverage"]}
                  onChange={(next) => updateConfigSectionField("systemParameters", "4gCoverage", next)}
                />
                <BooleanChoiceField
                  label={t("main.nbIotCoverage")}
                  value={activeDraft.systemParameters.nbIotCoverage}
                  error={errors["systemParameters.nbIotCoverage"]}
                  onChange={(next) => updateConfigSectionField("systemParameters", "nbIotCoverage", next)}
                />
                <BooleanChoiceField
                  label={t("main.lineOfSight")}
                  value={activeDraft.systemParameters.lineOfSightUnder15km}
                  error={errors["systemParameters.lineOfSightUnder15km"]}
                  onChange={(next) => updateConfigSectionField("systemParameters", "lineOfSightUnder15km", next)}
                />
              </>
            )}
          </div>
        </EditorialSection>

        {!calculatorMode && (
          <EditorialSection
            title="Spørsmål - anlegg, slipp og drift"
            description={`${completedQuestions} / ${visibleQuestions.length} fullført`}
          >
            <div className="grid gap-x-8 md:grid-cols-2">
              {visibleQuestions.map((question, index) => {
                const qLabel = question.labelKey ? t(question.labelKey) : question.label;
                const error = errors[question.key];

                return (
                  <div
                    key={question.key}
                    className={`grid gap-3 py-3 ${
                      index > 1 ? "border-t border-[var(--hg-hairline-2)]" : "md:border-t-0"
                    } ${index > 0 ? "max-md:border-t max-md:border-[var(--hg-hairline-2)]" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className={workspaceSubsectionTitleClassName}>{qLabel}</p>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-3">
                      {renderQuestionControl(question)}
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border text-[length:var(--hg-type-overline-size)] font-[var(--hg-type-weight-extra)] ${
                          isAnswered(activeDraft.answers[question.key])
                            ? "border-[var(--hg-accent-2)] bg-[var(--hg-accent-soft)] text-[var(--hg-accent)]"
                            : "border-[var(--hg-hairline)] text-[var(--hg-muted)]"
                        }`}
                        aria-hidden="true"
                      >
                        {isAnswered(activeDraft.answers[question.key]) ? "OK" : ""}
                      </span>
                    </div>
                    {error ? <p className="text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-600">{error}</p> : null}
                  </div>
                );
              })}
            </div>
          </EditorialSection>
        )}
      </div>
    </main>
  );
}
