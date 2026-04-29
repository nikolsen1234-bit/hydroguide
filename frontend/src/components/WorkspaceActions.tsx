import { useCallback, useEffect, useRef, useState } from "react";
import { FEEDBACK_TIMEOUT_MS } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";
import {
  workspaceDangerButtonClassName,
  workspaceHelpIconClassName,
  workspaceMetaClassName,
  workspacePrimaryButtonClassName,
  workspaceSecondaryButtonClassName
} from "../styles/workspace";

export function HelpTip({ text, iconClassName = workspaceHelpIconClassName }: { text: string; iconClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

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
        className={iconClassName}
      >
        i
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-lg sm:left-1/2 sm:w-56 sm:-translate-x-1/2">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export default function WorkspaceActions({
  onSave,
  onReset,
  children
}: {
  onSave: () => void;
  onReset: () => void;
  children?: React.ReactNode;
}) {
  const { activeDraft, exportConfiguration } = useConfigurationContext();
  const { t } = useLanguage();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>();

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_TIMEOUT_MS);
  }, []);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  const handleReset = useCallback(() => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      onReset();
    }
  }, [activeDraft.name, onReset, t]);

  const handleExport = useCallback(() => {
    try {
      exportConfiguration();
      showFeedback("success", t("shared.exportDownloaded"));
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("shared.exportFailed"));
    }
  }, [exportConfiguration, showFeedback, t]);

  return (
    <div className="border-t border-slate-200 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button type="button" onClick={handleReset} className={`w-full sm:w-auto ${workspaceDangerButtonClassName}`}>
          {t("shared.reset")}
        </button>
        <button type="button" onClick={onSave} className={`w-full sm:w-auto ${workspacePrimaryButtonClassName}`}>
          {t("shared.save")}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className={`w-full sm:w-auto ${workspaceSecondaryButtonClassName}`}
        >
          {t("shared.export")}
        </button>
        {children}
      </div>
      {feedback ? (
        <p
          className={`mt-2 ${workspaceMetaClassName} ${
            feedback.type === "success" ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
