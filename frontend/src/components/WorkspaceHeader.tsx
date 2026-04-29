import { useId } from "react";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceHeaderClassName,
  workspaceInputClassName,
  workspacePrimaryButtonClassName,
  workspaceTitleClassName
} from "../styles/workspace";

export default function WorkspaceHeader({
  title
}: {
  title: string;
}) {
  const { configurations, activeDraft, createNewConfiguration, selectConfiguration } = useConfigurationContext();
  const { t } = useLanguage();
  const selectableConfigurations = configurations.some((config) => config.id === activeDraft.id)
    ? configurations
    : [activeDraft, ...configurations];
  const displayName = (name: string) => name.trim() || t("shared.unnamed");
  const configurationSelectId = useId();

  return (
    <header className={workspaceHeaderClassName}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className={workspaceTitleClassName}>{title}</h1>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
          <label htmlFor={configurationSelectId} className="sr-only">
            {t("shared.thisConfiguration")}
          </label>
          <select
            id={configurationSelectId}
            value={activeDraft.id}
            onChange={(event) => selectConfiguration(event.target.value)}
            className={`w-full min-w-0 text-slate-950 ring-sky-200 sm:min-w-[220px] sm:flex-1 ${workspaceInputClassName}`}
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
      </div>
    </header>
  );
}
