import { Bookmark, BookmarkCheck, Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
}

export function SaveGameMenu({ state, sessionUserId, game, onOpen }: SaveGameMenuProps) {
  const { t, collectionName } = useI18n();
  const { collections, savedGamesByCollection } = state;
  const collectionDisabled = sessionUserId === null || state.loading || state.busy
    || Boolean(state.error);
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [isCreatingSaveCollection, setIsCreatingSaveCollection] = useState(false);
  const [saveCollectionName, setSaveCollectionName] = useState("");
  const selectedSavedCollectionIds = useMemo(() => {
    const ids = new Set<number>();
    for (const collection of collections) {
      if ((savedGamesByCollection[collection.id] ?? []).some((saved) => saved.gameId === game.id)) ids.add(collection.id);
    }
    return ids;
  }, [collections, savedGamesByCollection, game.id]);
  const selectedIsSaved = selectedSavedCollectionIds.size > 0;

  async function toggleSavedGameForCollection(collection: GameCollection) {
    if (selectedSavedCollectionIds.has(collection.id)) await state.remove(game.id, collection.id);
    else await state.save(game, collection);
  }
  async function createCollectionAndSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saveCollectionName.trim()) return;
    if (await state.createAndSave(saveCollectionName, game)) {
      setSaveCollectionName("");
      setIsCreatingSaveCollection(false);
    }
  }

  return (
    <div className="save-picker">
      <button
        className={`save-button ${selectedIsSaved ? "active" : ""}`}
        type="button"
        onClick={() => { if (!isSaveMenuOpen) onOpen?.(); setIsSaveMenuOpen((current) => !current); }}
        title={selectedIsSaved ? t("Manage saved collections", "管理收藏位置") : t("Choose a collection", "选择收藏夹")}
        aria-expanded={isSaveMenuOpen}
        disabled={collectionDisabled}
      >
        {selectedIsSaved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
        {sessionUserId === null ? t("Sign in to save", "登录后收藏") : selectedIsSaved ? t(`Saved (${selectedSavedCollectionIds.size})`, `已收藏 (${selectedSavedCollectionIds.size})`) : t("Save", "收藏")}
      </button>
      {isSaveMenuOpen && (
        <div className="save-menu">
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
                  <strong>{isSaved ? t("Remove", "移除") : t("Save", "收藏")}</strong>
                </button>
              );
            })}
          </div>
          {isCreatingSaveCollection ? (
            <form className="save-menu-create" onSubmit={(event) => void createCollectionAndSave(event)}>
              <input
                className="text-input"
                aria-label={t("New collection name", "新收藏夹名称")}
                placeholder={t("Research picks", "研究精选")}
                value={saveCollectionName}
                onChange={(event) => setSaveCollectionName(event.target.value)}
                disabled={collectionDisabled}
              />
              <button className="small-button" type="submit" disabled={collectionDisabled || !saveCollectionName.trim()}>
                {t("Create & Save", "创建并收藏")}
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
