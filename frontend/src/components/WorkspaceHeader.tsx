import { useId, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceHeaderClassName,
  workspaceInputClassName,
  workspacePrimaryButtonClassName,
  workspaceTitleClassName
} from "../styles/workspace";

export default function WorkspaceHeader({
  title,
  breadcrumb: explicitBreadcrumb,
  actions,
  showProjectControls = false
}: {
  title: string;
  breadcrumb?: string;
  actions?: ReactNode;
  showProjectControls?: boolean;
}) {
  const { configurations, activeDraft, createNewConfiguration, selectConfiguration } = useConfigurationContext();
  const { t } = useLanguage();
  const location = useLocation();
  const selectableConfigurations = configurations.some((config) => config.id === activeDraft.id)
    ? configurations
    : [activeDraft, ...configurations];
  const displayName = (name: string) => name.trim() || t("shared.unnamed");
  const configurationSelectId = useId();
  const projectName = displayName(activeDraft.name);
  const breadcrumbRoot = location.pathname === "/kontakt" || location.pathname === "/api" || location.pathname === "/dokumentasjon"
    ? "HydroGuide"
    : "Prosjekt";
  const breadcrumb = explicitBreadcrumb ?? `${breadcrumbRoot} / ${projectName} / ${title}`;

  return (
    <header className={workspaceHeaderClassName}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="hg-mono text-[10px] font-[var(--hg-type-weight-semibold)] uppercase tracking-[0.18em] text-[var(--hg-muted)]">
            {breadcrumb}
          </p>
          <h1 className={workspaceTitleClassName}>{title}</h1>
        </div>

        {actions ? <div className="flex min-w-0 flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">{actions}</div> : null}

        {showProjectControls ? (
        <div className="flex min-w-0 flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
          <label htmlFor={configurationSelectId} className="sr-only">
            {t("shared.thisConfiguration")}
          </label>
          <select
            id={configurationSelectId}
            value={activeDraft.id}
            onChange={(event) => selectConfiguration(event.target.value)}
            className={`w-full min-w-0 ring-[var(--hg-accent-2)] sm:min-w-[220px] sm:flex-1 ${workspaceInputClassName}`}
          >
            {selectableConfigurations.map((config) => (
              <option key={config.id} value={config.id}>
                {displayName(config.name)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={createNewConfiguration}
            className={`w-full shrink-0 sm:w-auto ${workspacePrimaryButtonClassName}`}
          >
            {t("shared.newConfiguration")}
          </button>
        </div>
        ) : null}
      </div>
    </header>
  );
}
