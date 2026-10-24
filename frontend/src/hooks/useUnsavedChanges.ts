import { useCallback, useEffect } from "react";
import { useI18n } from "../i18n";
import { registerNavigationGuard } from "./usePage";

export function useUnsavedChanges(dirty: boolean, onDiscard?: () => void) {
  const { t } = useI18n();
  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    if (!window.confirm(t("Discard your unsaved changes?", "放弃尚未保存的更改？"))) return false;
    onDiscard?.();
    return true;
  }, [dirty, t, onDiscard]);
  useEffect(() => {
    if (!dirty) return;
    const unregister = registerNavigationGuard(confirmDiscard);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, confirmDiscard]);
  return confirmDiscard;
}
