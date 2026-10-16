import { Bookmark, BookmarkCheck, Check, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { useCollections } from "../hooks/useCollections";
import { useI18n } from "../i18n";
import { DATA_MODE } from "../services/runtime";
import type { Game, GameCollection } from "../types";
import { ErrorNotice } from "./ui";

interface SaveGameMenuProps {
  state: ReturnType<typeof useCollections>;
  sessionUserId: string | null;
  game: Game;
  onOpen?: () => void;
  onSignIn?: () => void;
  resumeSave?: boolean;
}

type SaveAction = { kind: "save" | "remove" | "create"; collectionId?: number; name: string };

export function SaveGameMenu({ state, sessionUserId, game, onOpen, onSignIn, resumeSave }: SaveGameMenuProps) {
  const { t, collectionName } = useI18n();
  const { collections, savedGamesByCollection } = state;
  const [pending, setPending] = useState<SaveAction | null>(null);
  const [completed, setCompleted] = useState<SaveAction | null>(null);
  const writing = useRef(false);
  const collectionDisabled = sessionUserId === null || state.loading || state.busy || !!pending || Boolean(state.error);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [isCreatingSaveCollection, setIsCreatingSaveCollection] = useState(false);
  const [saveCollectionName, setSaveCollectionName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (resumeSave && sessionUserId && !state.loading && !state.error) {
      setIsSaveMenuOpen(true);
      onOpen?.();
    }
  }, [resumeSave, sessionUserId, state.loading, state.error, onOpen]);
  useEffect(() => {
    if (!isSaveMenuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    function dismissOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsSaveMenuOpen(false);
    }
    function dismissWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Handle this before a containing record dialog receives its native cancel event.
      event.preventDefault(); event.stopPropagation();
      setIsSaveMenuOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape, true);
    };
  }, [isSaveMenuOpen]);
  const selectedSavedCollectionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const collection of collections) {
      if ((savedGamesByCollection[collection.id] ?? []).some((saved) => saved.gameId === game.id)) ids.add(collection.id);
    }
    return ids;
  }, [collections, savedGamesByCollection, game.id]);
  const selectedIsSaved = selectedSavedCollectionIds.size > 0;
  const pendingLabel = pending?.kind === "remove" ? t("Removing…", "移除中…")
    : pending?.kind === "create" ? t("Creating & saving…", "创建并收藏中…") : t("Saving…", "收藏中…");
  const completedName = completed ? collectionName(completed.name) : "";
  const feedback = pending ? pendingLabel : completed ? completed.kind === "remove"
    ? t(`Removed from ${completedName}`, `已从「${completedName}」移除`)
    : t(`Saved to ${completedName}`, `已收藏到「${completedName}」`) : "";

  async function runAction(action: SaveAction, write: () => Promise<boolean>) {
    if (writing.current || collectionDisabled) return false;
    writing.current = true;
    setCompleted(null);
    setPending(action);
    try {
      const success = await write();
      if (success) setCompleted(action);
      return success;
    } finally {
      writing.current = false;
      setPending(null);
    }
  }

  async function toggleSavedGameForCollection(collection: GameCollection) {
    const remove = selectedSavedCollectionIds.has(collection.id);
    await runAction({ kind: remove ? "remove" : "save", collectionId: collection.id, name: collection.name },
      () => remove ? state.remove(game.id, collection.id) : state.save(game, collection));
  }
  async function createCollectionAndSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saveCollectionName.trim()) return;
    if (await runAction({ kind: "create", name: saveCollectionName.trim() }, () => state.createAndSave(saveCollectionName, game))) {
      setSaveCollectionName("");
      setIsCreatingSaveCollection(false);
    }
  }

  return (
    <div ref={rootRef} className="save-picker">
      <button
        ref={triggerRef}
        className={`save-button ${selectedIsSaved ? "active" : ""}`}
        type="button"
        onClick={() => {
          if (sessionUserId === null) { onSignIn?.(); return; }
          if (!isSaveMenuOpen) onOpen?.();
          setIsSaveMenuOpen((current) => !current);
        }}
        title={selectedIsSaved ? t("Manage saved collections", "管理收藏位置") : t("Choose a collection", "选择收藏夹")}
        aria-expanded={isSaveMenuOpen}
        aria-controls={isSaveMenuOpen ? menuId : undefined}
        aria-busy={!!pending}
        disabled={sessionUserId === null ? !onSignIn : state.loading}
      >
        {pending ? <LoaderCircle className="pending-icon" size={16} aria-hidden="true" /> : selectedIsSaved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
        {pending ? pendingLabel : sessionUserId === null ? t("Sign in to save", "登录后收藏") : selectedIsSaved ? t(`Saved (${selectedSavedCollectionIds.size})`, `已收藏 (${selectedSavedCollectionIds.size})`) : t("Save", "收藏")}
      </button>
      <p className="save-feedback" role="status" aria-atomic="true">{feedback}</p>
      {isSaveMenuOpen && (
        <div ref={menuRef} id={menuId} className="save-menu">
          <div className="save-menu-header">
            <strong>{t("Choose Collection", "选择收藏夹")}</strong>
            <span>{t(`${selectedSavedCollectionIds.size} saved`, `已存入 ${selectedSavedCollectionIds.size} 个收藏夹`)}</span>
          </div>
          <p className="mode-description">{DATA_MODE === "demo" ? t("Storage: this browser", "保存位置：当前浏览器") : t("Storage: your account", "保存位置：你的账号")}</p>
          {state.error && <ErrorNotice message={state.error} onRetry={state.retry} retryLabel={t("Reload collections", "重新加载收藏夹")} disabled={state.busy} />}
          <div className="save-menu-list">
            {collections.map((collection) => {
              const isSaved = selectedSavedCollectionIds.has(collection.id);
              return (
                <button
                  key={collection.id}
                  className={`save-menu-option ${isSaved ? "active" : ""}`}
                  type="button"
                  onClick={() => void toggleSavedGameForCollection(collection)}
                  disabled={collectionDisabled}
                >
                  <span className="save-menu-check">{isSaved && <Check size={14} aria-hidden="true" />}</span>
                  <span>{collectionName(collection.name)}</span>
                  <strong>{pending?.collectionId === collection.id ? pendingLabel : isSaved ? t("Remove", "移除") : t("Save", "收藏")}</strong>
                </button>
              );
            })}
          </div>
          {isCreatingSaveCollection ? (
            <form className="save-menu-create" onSubmit={(event) => void createCollectionAndSave(event)}>
              <input
                className="text-input"
                autoFocus
                aria-label={t("New collection name", "新收藏夹名称")}
                placeholder={t("Research picks", "研究精选")}
                value={saveCollectionName}
                onChange={(event) => setSaveCollectionName(event.target.value)}
                disabled={collectionDisabled}
              />
              <button className="small-button" type="submit" disabled={collectionDisabled || !saveCollectionName.trim()}>
                {pending?.kind === "create" ? pendingLabel : t("Create & Save", "创建并收藏")}
              </button>
            </form>
          ) : (
            <button className="save-menu-create-button" type="button" onClick={() => setIsCreatingSaveCollection(true)} disabled={collectionDisabled}>
              <Plus size={14} aria-hidden="true" />
              {t("New Collection", "新建收藏夹")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
