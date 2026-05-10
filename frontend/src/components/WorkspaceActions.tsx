import { useEffect, useId, useRef, useState } from "react";
import { workspaceContentValueClassName, workspaceHelpIconClassName } from "../styles/workspace";

export function HelpTip({ text, iconClassName = workspaceHelpIconClassName }: { text: string; iconClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    const events = ["mousedown", "touchstart"] as const;
    events.forEach((event) => document.addEventListener(event, handleOutside));
    return () => events.forEach((event) => document.removeEventListener(event, handleOutside));
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={text}
        aria-expanded={open}
        aria-controls={open ? tooltipId : undefined}
        className={iconClassName}
      >
        i
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute left-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-surface)] px-3 py-2.5 text-left leading-5 normal-case text-[var(--hg-ink-2)] sm:left-1/2 sm:w-72 sm:-translate-x-1/2 ${workspaceContentValueClassName}`}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
