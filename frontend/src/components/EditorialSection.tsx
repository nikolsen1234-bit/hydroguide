import type { ReactNode } from "react";
import { workspaceSectionTitleClassName, workspaceMetaClassName } from "../styles/workspace";

export type EditorialSectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function EditorialSection({
  title,
  description,
  actions,
  className,
  children,
}: EditorialSectionProps): JSX.Element {
  return (
    <section className={`border-t-2 border-[var(--hg-ink)] pt-2 ${className ?? ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <h2 className={workspaceSectionTitleClassName}>{title}</h2>
          {description ? <p className={workspaceMetaClassName}>{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
