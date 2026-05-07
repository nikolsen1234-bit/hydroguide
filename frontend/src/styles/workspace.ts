export const workspacePageClassName =
  "min-h-full space-y-4 bg-[var(--hg-bg)] px-4 pb-8 pt-0 text-[var(--hg-ink)] sm:px-6 lg:px-7";

export const workspaceHeaderClassName =
  "sticky top-0 z-20 -mx-4 border-b border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7";

export const workspaceTitleClassName =
  "text-[length:var(--hg-type-page-title-size)] font-[var(--hg-type-weight-extra)] leading-[var(--hg-type-page-title-leading)] tracking-[var(--hg-type-title-tracking)] text-[var(--hg-ink)]";

export const workspaceSectionTitleClassName =
  "text-[length:var(--hg-type-section-title-size)] font-[var(--hg-type-weight-bold)] leading-[var(--hg-type-section-title-leading)] tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-ink)]";

export const workspaceSubsectionTitleClassName =
  "text-[length:var(--hg-type-category-size)] font-[var(--hg-type-weight-bold)] leading-[var(--hg-type-category-leading)] tracking-[var(--hg-type-tight-tracking)] text-[var(--hg-ink)]";

export const workspaceSectionHeadingRowClassName = "flex flex-wrap items-center gap-2";

export const workspaceSectionClassName = "overflow-hidden";

export const workspaceSectionHeaderClassName =
  "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

export const workspaceBodyClassName = "text-[length:var(--hg-type-content-size)] leading-[var(--hg-type-content-leading)] text-[var(--hg-ink)]";

export const workspaceMetaClassName =
  "hg-mono text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-medium)] uppercase tracking-[0.14em] text-[var(--hg-muted)]";

export const workspaceBodyStrongClassName = `${workspaceBodyClassName} font-[var(--hg-type-weight-semibold)]`;

export const workspaceBodyMutedClassName = `${workspaceBodyClassName} text-[var(--hg-muted)]`;

export const workspaceMetaMutedClassName = workspaceMetaClassName;

export const workspaceContentTitleClassName = workspaceSectionTitleClassName;
export const workspaceContentCategoryClassName = workspaceSubsectionTitleClassName;
export const workspaceContentValueBaseClassName =
  "text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] leading-[var(--hg-type-content-leading)] [overflow-wrap:anywhere]";
export const workspaceContentValueClassName = `${workspaceContentValueBaseClassName} text-[var(--hg-ink)]`;

export const workspaceChartAxisClassName = "fill-[var(--hg-muted)] text-[length:var(--hg-type-chart-size)]";
export const workspaceChartLabelClassName =
  "fill-[var(--hg-ink)] text-[length:var(--hg-type-chart-size)] font-[var(--hg-type-weight-semibold)]";
export const workspaceChartMonthClassName = "fill-[var(--hg-muted)] text-[length:var(--hg-type-chart-size)]";
export const workspaceChartLegendClassName =
  "text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] leading-[var(--hg-type-content-leading)] text-[var(--hg-ink)]";
export const workspaceChartTooltipTitleFontSize = "var(--hg-chart-tooltip-title-size)";
export const workspaceChartTooltipTextFontSize = "var(--hg-chart-tooltip-text-size)";

export const workspaceFieldLabelClassName =
  "text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] leading-[var(--hg-type-category-leading)] text-[var(--hg-ink-2)]";
export const workspaceFieldLabelRowClassName = "flex items-center gap-2";
export const workspaceFieldStackClassName = "space-y-2";

export const workspaceInputClassName =
  "w-full rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 py-2 text-[length:var(--hg-type-content-size)] text-[var(--hg-ink)] outline-none ring-[var(--hg-accent-2)] transition placeholder:text-[var(--hg-muted)] focus:ring-2";

export const workspaceTallInputClassName =
  "h-12 w-full rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-medium)] text-[var(--hg-ink)] outline-none transition placeholder:text-[var(--hg-muted)] focus:border-[var(--hg-accent-2)] focus:bg-[var(--hg-accent-soft)]";

export const workspaceHelpIconClassName =
  "inline-flex h-5 w-5 cursor-help items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[length:var(--hg-type-meta-size)] font-[var(--hg-type-weight-bold)] leading-[var(--hg-type-category-leading)] text-[var(--hg-muted)] sm:h-4 sm:w-4";

export const workspacePrimaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-[var(--hg-accent)] px-4 py-2 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-white transition hover:bg-[var(--hg-accent-2)]";

export const workspaceSecondaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-4 py-2 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)] transition hover:bg-[var(--hg-surface-2)]";

export const workspaceDangerButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-[length:var(--hg-type-ui-size)] font-[var(--hg-type-weight-semibold)] text-rose-700 transition hover:bg-rose-100";
