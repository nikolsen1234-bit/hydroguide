import { useCallback, useEffect, useRef, useState } from "react";
import { FEEDBACK_TIMEOUT_MS, IMPORT_FILE_EXTENSION, IMPORT_FILE_MAX_BYTES } from "../constants";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";

function eventHasFiles(event: DragEvent | React.DragEvent) {
  const types = event.dataTransfer?.types;
  if (!types) {
    return false;
  }

  return Array.from(types).includes("Files");
}

function isLeavingViewport(event: DragEvent | React.DragEvent) {
  return (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  );
}

export default function ImportDropZone() {
  const { importConfiguration } = useConfigurationContext();
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>();

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_TIMEOUT_MS);
  }, []);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  const importFile = useCallback(
    async (file: File) => {
      try {
        const imported = await importConfiguration(file);
        if (imported) {
          showFeedback("success", t("shared.imported").replace("{name}", file.name));
        }
      } catch (error) {
        showFeedback("error", error instanceof Error ? error.message : t("shared.invalidConfigFile"));
      }
    },
    [importConfiguration, showFeedback, t]
  );

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!eventHasFiles(event)) {
        return;
      }
      event.preventDefault();
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!eventHasFiles(event)) {
        return;
      }
      event.preventDefault();
      if (!isDragging) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!eventHasFiles(event)) {
        return;
      }
      if (isLeavingViewport(event)) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      if (!eventHasFiles(event)) {
        return;
      }
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) {
        void importFile(file);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [importFile, isDragging]);

  return (
    <>
      {isDragging ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-950/25 backdrop-blur-[2px]"
          onDragOver={(event) => {
            if (eventHasFiles(event)) {
              event.preventDefault();
            }
          }}
          onDragLeave={(event) => {
            if (eventHasFiles(event) && isLeavingViewport(event)) {
              setIsDragging(false);
            }
          }}
          onDrop={(event) => {
            if (!eventHasFiles(event)) {
              return;
            }
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer?.files[0];
            if (file) {
              void importFile(file);
            }
          }}
        >
          <div className="pointer-events-none rounded-3xl border-2 border-dashed border-brand-400 bg-white/90 px-10 py-8 text-center shadow-2xl">
            <svg viewBox="0 0 24 24" fill="none" className="mx-auto h-8 w-8 stroke-brand-500" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-base font-bold text-brand-700">{t("shared.dropToImport")}</p>
            <p className="mt-1 text-sm font-medium text-slate-950">
              {t("shared.onlyFiles").replace("{ext}", IMPORT_FILE_EXTENSION).replace("{size}", String(Math.floor(IMPORT_FILE_MAX_BYTES / 1024)))}
            </p>
          </div>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`fixed bottom-6 left-1/2 z-[101] -translate-x-1/2 rounded-2xl px-6 py-3 text-sm font-semibold shadow-lg ${
            feedback.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}
    </>
  );
}
