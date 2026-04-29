import { useMemo } from "react";
import { BooleanChoiceField, JaNeiField, NumberField, SelectField } from "../components/FormFields";
import WorkspaceActions from "../components/WorkspaceActions";
import WorkspaceHeader from "../components/WorkspaceHeader";
import WorkspaceSection from "../components/WorkspaceSection";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import { sections } from "../questions";
import { workspacePageClassName } from "../styles/workspace";
import { validateConfiguration } from "../utils/validation";

export default function MainPage() {
  const { activeDraft, resetDraft, updateAnswer, updateConfigSectionField, saveDraftMetadata } =
    useConfigurationContext();
  const { t, language } = useLanguage();
  const calculatorMode = (activeDraft.engineMode ?? "standard") === "standard";
  const validationErrors = useMemo(() => validateConfiguration(activeDraft), [activeDraft, language]);
  const errors = calculatorMode
    ? { "other.evaluationHorizonYears": validationErrors["other.evaluationHorizonYears"] }
    : validationErrors;

  const handleSave = () => {
    saveDraftMetadata();
  };

  const handleReset = () => {
    resetDraft();
  };

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("main.title")} />

      <WorkspaceSection title={t("main.operatingAssumptions")}>
        <div className="grid gap-5 md:grid-cols-2">
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
            <NumberField
              label={t("main.inspectionsPerYear")}
              unit={t("main.perYear")}
              value={activeDraft.systemParameters.inspectionsPerYear}
              error={errors["systemParameters.inspectionsPerYear"]}
              min={0}
              step={1}
              onChange={(next) => updateConfigSectionField("systemParameters", "inspectionsPerYear", next)}
            />
          )}
        </div>
      </WorkspaceSection>

      {!calculatorMode && (
        <>
          <WorkspaceSection
            title={t("main.locationAndCommunication")}
            description={t("main.locationDescription")}
          >
            <div className="grid gap-5 lg:grid-cols-3">
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
            </div>
          </WorkspaceSection>

          <div className="space-y-6">
            {sections.map((section) => (
              <WorkspaceSection key={section.title} title={section.titleKey ? t(section.titleKey) : section.title}>
                <div className="space-y-5">
                  {section.questions.filter((q) => !q.hidden && (!q.condition || q.condition(activeDraft.answers))).map((question) => {
                    const value = activeDraft.answers[question.key];
                    const error = errors[question.key];
                    const qLabel = question.labelKey ? t(question.labelKey) : question.label;
                    const qHelper = question.helperKey ? t(question.helperKey) : question.helper;
                    const qUnit = question.unitKey ? t(question.unitKey) : question.unit;
                    const qOptions = question.options?.map((opt) => ({
                      value: opt.value,
                      label: opt.labelKey ? t(opt.labelKey) : opt.label
                    }));

                    if (question.input === "select") {
                      return (
                        <SelectField
                          key={question.key}
                          label={qLabel}
                          helper={qHelper}
                          value={String(value)}
                          options={qOptions ?? []}
                          error={error}
                          onChange={(next) => updateAnswer(question.key, next as typeof value)}
                        />
                      );
                    }

                    if (question.input === "number") {
                      return (
                        <NumberField
                          key={question.key}
                          label={qLabel}
                          helper={qHelper}
                          unit={qUnit}
                          value={typeof value === "number" ? value : ""}
                          error={error}
                          onChange={(next) => updateAnswer(question.key, next)}
                        />
                      );
                    }

                    return (
                      <JaNeiField
                        key={question.key}
                        label={qLabel}
                        helper={qHelper}
                        value={value as "ja" | "nei" | ""}
                        error={error}
                        onChange={(next) => updateAnswer(question.key, next as typeof value)}
                      />
                    );
                  })}
                </div>
              </WorkspaceSection>
            ))}
          </div>
        </>
      )}

      <WorkspaceActions onReset={handleReset} onSave={handleSave} />
    </main>
  );
}
