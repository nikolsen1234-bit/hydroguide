import type { ReactNode } from "react";
import {
  workspaceSectionClassName,
  workspaceSectionHeaderClassName,
  workspaceSectionHeadingRowClassName,
  workspaceSectionTitleClassName
} from "../styles/workspace";
import { HelpTip } from "./WorkspaceActions";

export default function WorkspaceSection({
  title,
  description,
  actions,
  children
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={workspaceSectionClassName}>
      <div className={workspaceSectionHeaderClassName}>
        <div className="min-w-0">
          <div className={workspaceSectionHeadingRowClassName}>
            {typeof title === "string" ? <h2 className={workspaceSectionTitleClassName}>{title}</h2> : title}
            {description ? <HelpTip text={description} /> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 self-start">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
