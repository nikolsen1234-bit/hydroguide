import { useCallback } from "react";
import { useConfigurationContext } from "../context/ConfigurationContext";
import { useLanguage } from "../i18n";

export function useResetDraftWithConfirm() {
  const { activeDraft, resetDraft } = useConfigurationContext();
  const { t } = useLanguage();

  return useCallback(() => {
    const configurationName = activeDraft.name.trim() || t("shared.thisConfiguration");
    if (window.confirm(t("shared.resetConfirm").replace("{name}", configurationName))) {
      resetDraft();
    }
  }, [activeDraft.name, resetDraft, t]);
}
