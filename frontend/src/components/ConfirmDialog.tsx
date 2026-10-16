import { useLayoutEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel, busy = false, disabled = false }: {
  title: string; children: ReactNode; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; busy?: boolean; disabled?: boolean;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    el?.showModal();
    cancel.current?.focus();
    return () => { el?.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    <div id={descriptionId}>{children}</div>
    <div className="record-actions">
      <button ref={cancel} className="small-button" type="button" disabled={busy} onClick={onCancel}>{t("Cancel", "取消")}</button>
      <button className="small-button danger" type="button" disabled={busy || disabled} onClick={onConfirm}>
        {busy ? t("Saving change…", "正在保存更改…") : confirmLabel}
      </button>
    </div>
  </dialog>;
}
