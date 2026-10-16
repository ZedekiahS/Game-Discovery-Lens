import { useCallback, useEffect } from "react";
import { useI18n } from "../i18n";
import { registerNavigationGuard } from "./usePage";

export function useUnsavedChanges(dirty: boolean) {
  const { t } = useI18n();
  const confirmDiscard = useCallback(() => !dirty || window.confirm(t(
    "Discard your unsaved changes?", "放弃尚未保存的更改？",
  )), [dirty, t]);
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
