import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceHeaderClassName,
  workspaceInputClassName,
  workspaceOverlineClassName,
  workspacePrimaryButtonClassName,
  workspaceTitleClassName
} from "../styles/workspace";

type WorkspaceHeaderActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: string;
  label: string;
  primary?: boolean;
  subLabel?: string;
  tone?: "accent" | "success" | "warning";
};

export const workspaceHeaderActionIcons = {
  plus: "M12 4.5v15m7.5-7.5h-15",
  upload: "M12 19.25v-9.5m0 0-4 4m4-4 4 4M5 7.25v-1.5A1.75 1.75 0 0 1 6.75 4h10.5A1.75 1.75 0 0 1 19 5.75v1.5",
  save: "M4.5 12.75 10.5 18.75 19.5 5.25",
  reset: "M3.75 12A8.25 8.25 0 0 1 18.5 6.85M20.25 6.75V3.75h-3M20.25 12A8.25 8.25 0 0 1 5.5 17.15M3.75 17.25v3h3",
  run: "M4.5 5.25v13.5l12-6.75-12-6.75Z",
  report: "M7.5 3.75h6l3 3v13.5h-9A2.25 2.25 0 0 1 5.25 18V6A2.25 2.25 0 0 1 7.5 3.75ZM13.5 3.75v3h3M8.25 11.25h7.5M8.25 14.25h7.5M8.25 17.25h4.5"
} as const;

const hydroGuideBreadcrumbPaths = new Set(["/kontakt", "/api", "/dokumentasjon"]);

export function WorkspaceHeaderActionButton({
  icon,
  label,
  primary = false,
  subLabel,
  tone = "accent",
  className,
  style,
  ...buttonProps
}: WorkspaceHeaderActionButtonProps) {
  const buttonClassName = [
    "hg-header-action-button",
    primary ? "hg-header-action-button--primary" : "",
    subLabel ? "hg-header-action-button--wide" : "",
    className ?? ""
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      data-tone={tone}
      style={style}
      {...buttonProps}
    >
      {icon ? (
        <span className="hg-header-action-icon flex h-5 w-5 shrink-0 items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-[19px] w-[19px] stroke-current" strokeWidth="1.8" aria-hidden="true">
            <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-bold)] leading-[1.05] text-[var(--hg-ink)]">
          {label}
        </span>
        {subLabel ? (
          <span className="mt-0.5 block truncate text-[length:var(--hg-type-ui-size)] leading-[1.15] text-[var(--hg-muted)]">
            {subLabel}
          </span>
        ) : null}
      </span>
      <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 stroke-[var(--hg-muted)]" strokeWidth="1.7" aria-hidden="true">
        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

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
  const breadcrumbRoot = hydroGuideBreadcrumbPaths.has(location.pathname) ? "HydroGuide" : "Prosjekt";
  const breadcrumb = explicitBreadcrumb ?? `${breadcrumbRoot} / ${projectName} / ${title}`;

  return (
    <header className={workspaceHeaderClassName}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className={`${workspaceOverlineClassName} text-[var(--hg-muted)]`}>
            {breadcrumb}
          </p>
          <h1 className={workspaceTitleClassName}>{title}</h1>
        </div>

        {actions ? <div className="flex min-w-0 flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{actions}</div> : null}

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
            onClick={() => createNewConfiguration(activeDraft.engineMode)}
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
