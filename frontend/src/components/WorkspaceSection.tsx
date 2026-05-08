import { useState, type ReactNode } from "react";
import {
  workspaceBodyMutedClassName,
  workspaceMetaClassName,
  workspaceSectionClassName,
  workspaceSectionHeaderClassName,
  workspaceSectionHeadingRowClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";

export default function WorkspaceSection({
  title,
  description,
  kicker,
  actions,
  collapsible = false,
  defaultExpanded = true,
  children
}: {
  title: ReactNode;
  description?: string;
  kicker?: string;
  actions?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const useInlineMeta = Boolean(description && description.length < 80);

  return (
    <section className={`hg-card ${workspaceSectionClassName}`}>
      <div className={`hg-card-header px-4 py-3 ${workspaceSectionHeaderClassName}`}>
        <div className="min-w-0">
          {kicker ? (
            <p className="hg-mono mb-1 text-[10px] font-[var(--hg-type-weight-bold)] uppercase tracking-[0.18em] text-[var(--hg-ink-2)]">
              {kicker}
            </p>
          ) : null}
          <div className={workspaceSectionHeadingRowClassName}>
            {typeof title === "string" ? <h2 className={workspaceSectionTitleClassName}>{title}</h2> : title}
            {useInlineMeta ? <p className={workspaceMetaClassName}>{description}</p> : null}
          </div>
          {description && !useInlineMeta ? (
            <p className={`mt-1 max-w-3xl ${workspaceBodyMutedClassName}`}>
              {description}
            </p>
          ) : null}
        </div>
        {(actions || collapsible) ? (
          <div className="flex w-full items-center gap-2 self-start sm:w-auto sm:shrink-0">
            {actions ? <div className="min-w-0 flex-1 sm:flex-initial">{actions}</div> : null}
            {collapsible ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((current) => !current)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--hg-hairline)] bg-[var(--hg-surface)] text-[var(--hg-muted)] transition hover:text-[var(--hg-ink)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`h-4 w-4 stroke-current transition-transform ${expanded ? "" : "-rotate-90"}`}
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {expanded ? <div className="p-4">{children}</div> : null}
    </section>
  );
}
