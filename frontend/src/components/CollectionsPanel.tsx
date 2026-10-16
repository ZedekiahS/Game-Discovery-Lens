import { Folder, LineChart, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { useCollections } from "../hooks/useCollections";
import { useI18n } from "../i18n";
import { hasOriginalInsightContent, localizeCollectionInsights } from "../i18n/content";
import { ErrorNotice, Metric } from "./ui";
import type { CollectionPurpose } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

const DEFAULT_COLLECTION_NAME = "Default Shortlist";

interface CollectionsPanelProps {
  state: ReturnType<typeof useCollections>;
  sessionUserId: string | null;
  selectedId: number | null;
  onSelectGame: (id: number) => void;
  view?: "player" | "developer";
  hideInsights?: boolean;
}

export function CollectionsPanel({ state, sessionUserId, selectedId, onSelectGame, view = "player", hideInsights = false }: CollectionsPanelProps) {
  const { language, t, money, number, tag, collectionName } = useI18n();
  const { collections, activeCollectionId, savedGamesByCollection, shortlistInsights } = state;
  const collectionDisabled = sessionUserId === null || state.loading || state.busy
    || Boolean(state.error);
  const [confirmation, setConfirmation] = useState<"clear" | "delete" | null>(null);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [editingCollectionName, setEditingCollectionName] = useState("");
  const savedGames = useMemo(() => activeCollectionId === null ? [] : savedGamesByCollection[activeCollectionId] ?? [], [activeCollectionId, savedGamesByCollection]);
  const localizedInsights = shortlistInsights ? localizeCollectionInsights(shortlistInsights, savedGames, language) : null;
  const showOriginalBody = Boolean(shortlistInsights && localizedInsights
    && hasOriginalInsightContent(shortlistInsights.strategy, localizedInsights.strategy, language)
    && shortlistInsights.strategy.body === localizedInsights.strategy.body
    && /[A-Za-z]/.test(localizedInsights.strategy.body)
    && !/[\u3400-\u9fff]/.test(localizedInsights.strategy.body));
  const selectedCollection = collections.find((collection) => collection.id === activeCollectionId) ?? null;
  const isDefaultCollection = selectedCollection?.name === DEFAULT_COLLECTION_NAME;

  async function clearShortlist() {
    if (activeCollectionId !== null && await state.clear(activeCollectionId)) setConfirmation(null);
  }
  async function addCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCollectionName.trim()) return;
    if (await state.create(newCollectionName)) {
      setNewCollectionName("");
      setIsCreatingCollection(false);
    }
  }
  function selectCollection(collectionId: number) {
    setConfirmation(null);
    state.setActiveCollectionId(collectionId);
    setIsEditingCollection(false);
    setEditingCollectionName("");
  }
  function startEditingCollection() {
    if (!selectedCollection || isDefaultCollection) return;
    setIsCreatingCollection(false);
    setIsEditingCollection(true);
    setEditingCollectionName(selectedCollection.name);
  }
  async function renameCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCollection || isDefaultCollection || !editingCollectionName.trim()) return;
    if (await state.rename(selectedCollection.id, editingCollectionName)) {
      setIsEditingCollection(false);
      setEditingCollectionName("");
    }
  }
  async function removeCollection() {
    if (!selectedCollection || isDefaultCollection) return;
    if (await state.deleteCollection(selectedCollection.id)) {
      setConfirmation(null);
      setIsEditingCollection(false);
      setEditingCollectionName("");
    }
  }

  return (
    <>
      <section className="tool-panel shortlist-panel">
        <div className="section-heading">
          <h2>
            <Folder size={16} aria-hidden="true" />
            {t("Collections", "收藏夹")}
          </h2>
          <div className="section-actions">
            <span>{t(`${savedGames.length} saved`, `已收藏 ${savedGames.length} 款`)}</span>
            {savedGames.length > 0 && (
              <button
                className="icon-button danger"
                type="button"
                onClick={() => setConfirmation("clear")}
                title={t("Clear shortlist", "清空收藏")}
                aria-label={t("Clear shortlist", "清空收藏")}
                disabled={collectionDisabled}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {sessionUserId === null && <p className="mode-description">{t("Sign in to load and save your collections.", "登录后即可查看和保存收藏夹。")}</p>}
        {state.loading && <p role="status" className="mode-description">{t("Loading collections…", "正在加载收藏夹…")}</p>}
        {state.busy && <p role="status" className="mode-description">{t("Saving change…", "正在保存更改…")}</p>}
        <div className="collection-controls">
          <label className="field compact">
            <span>{t("Collection", "收藏夹")}</span>
            <select
              value={activeCollectionId ?? ""}
              onChange={(event) => selectCollection(Number(event.target.value))}
              disabled={collectionDisabled || collections.length === 0}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collectionName(collection.name)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            type="button"
            onClick={() => setIsCreatingCollection((current) => !current)}
            title={t("New collection", "新建收藏夹")}
            aria-label={t("New collection", "新建收藏夹")}
            disabled={collectionDisabled}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={startEditingCollection}
            title={t("Rename collection", "重命名收藏夹")}
            aria-label={t("Rename collection", "重命名收藏夹")}
            disabled={collectionDisabled || !selectedCollection || isDefaultCollection}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            className="icon-button danger"
            type="button"
            onClick={() => setConfirmation("delete")}
            title={t("Delete collection", "删除收藏夹")}
            aria-label={t("Delete collection", "删除收藏夹")}
            disabled={collectionDisabled || !selectedCollection || isDefaultCollection}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        {selectedCollection && <label className="field collection-purpose"><span>{t("Collection purpose", "收藏夹用途")}</span>
          <select aria-label={t("Collection purpose", "收藏夹用途")} value={selectedCollection.purpose ?? "unspecified"} disabled={collectionDisabled} onChange={(e) => void state.setPurpose(selectedCollection, e.target.value as CollectionPurpose)}>
            <option value="unspecified">{t("Not set", "尚未设置")}</option><option value="player">{t("Personal interests", "个人喜好")}</option><option value="research">{t("Research references", "研究参考")}</option>
          </select><small>{t("Only personal collections contribute to your taste profile.", "只有个人喜好收藏夹会计入玩家画像。")}</small>
        </label>}
        {isCreatingCollection && (
          <form className="collection-create" onSubmit={(event) => void addCollection(event)}>
            <input
              className="text-input"
              aria-label={t("Collection name", "收藏夹名称")}
              placeholder={t("Wishlist", "愿望单")}
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              disabled={collectionDisabled}
            />
            <button className="small-button" type="submit" disabled={collectionDisabled || !newCollectionName.trim()}>
              {t("Create", "创建")}
            </button>
          </form>
        )}
        {isEditingCollection && selectedCollection && (
          <form className="collection-edit" onSubmit={(event) => void renameCollection(event)}>
            <input
              className="text-input"
              aria-label={t("Rename collection", "重命名收藏夹")}
              value={editingCollectionName}
              onChange={(event) => setEditingCollectionName(event.target.value)}
              disabled={collectionDisabled}
            />
            <button className="small-button" type="submit" disabled={collectionDisabled || !editingCollectionName.trim()}>
              {t("Save", "保存")}
            </button>
          </form>
        )}
        {state.error && <ErrorNotice message={state.error} onRetry={state.retry} retryLabel={t("Reload collections", "重新加载收藏夹")} disabled={state.busy} />}
        <div className="shortlist-list">
          {savedGames.map((savedGame) => (
            <button
              key={`${savedGame.collectionId}-${savedGame.gameId}`}
              className={`shortlist-item ${selectedId === savedGame.gameId ? "active" : ""}`}
              type="button"
              onClick={() => onSelectGame(savedGame.gameId)}
            >
              <span>{savedGame.game.name}</span>
              <strong>{money(savedGame.game.price)}</strong>
            </button>
          ))}
          {savedGames.length === 0 && !state.loading && !state.error && selectedCollection && <div className="empty-state compact">{t("No saved games in this collection.", "这个收藏夹还没有游戏。")}</div>}
        </div>
      </section>

      {confirmation && selectedCollection && <ConfirmDialog
        title={confirmation === "clear" ? t("Clear this collection?", "清空这个收藏夹？") : t("Delete this collection?", "删除这个收藏夹？")}
        confirmLabel={confirmation === "clear" ? t("Clear collection", "确认清空") : t("Delete permanently", "确认删除")}
        onConfirm={() => void (confirmation === "clear" ? clearShortlist() : removeCollection())}
        onCancel={() => setConfirmation(null)} busy={state.busy} disabled={collectionDisabled}>
        <p>{confirmation === "clear"
          ? t(`Remove ${savedGames.length === 1 ? "the saved game" : `all ${savedGames.length} saved games`} from “${collectionName(selectedCollection.name)}”?`, `从“${collectionName(selectedCollection.name)}”中移除全部 ${savedGames.length} 款收藏游戏？`)
          : t(`Delete “${collectionName(selectedCollection.name)}” and its ${savedGames.length} saved ${savedGames.length === 1 ? "game" : "games"}?`, `删除“${collectionName(selectedCollection.name)}”及其中的 ${savedGames.length} 款收藏游戏？`)}</p>
        <p>{t("This cannot be undone. Your play records, notes and other collections will stay.", "此操作无法撤销。游玩记录、笔记和其他收藏夹会保留。")}</p>
        {state.error && <ErrorNotice message={state.error} onRetry={() => { setConfirmation(null); state.retry(); }} retryLabel={t("Reload collections", "重新加载收藏夹")} disabled={state.busy} />}
      </ConfirmDialog>}
      {state.insightsError && !hideInsights && <ErrorNotice message={state.insightsError} onRetry={state.retry} retryLabel={t("Retry collection intelligence", "重新获取收藏洞察")} disabled={state.busy} />}
      {!hideInsights && savedGames.length > 0 && shortlistInsights && localizedInsights && (
        <details className="tool-panel shortlist-insight-panel collection-insight-disclosure">
          <summary>
            <LineChart size={16} aria-hidden="true" />
            <span>{t("Collection insights", "收藏洞察")}</span>
          </summary>
          <p className="supporting-note">
            {t("Based on the games in this collection.", "依据此收藏夹中的游戏整理。")}
          </p>
          <div className="shortlist-insight-metrics">
            <Metric label={t("Avg Price", "平均价格")} value={money(shortlistInsights.averagePrice)} />
            <Metric label={t("Avg Rating", "平均评分")} value={shortlistInsights.averageRating.toFixed(1)} />
          </div>
          {showOriginalBody && <p className="supporting-note">{t("Original content", "原始内容")}</p>}
          <p className="shortlist-summary">{localizedInsights.strategy.body}</p>
          {shortlistInsights.topTags.length > 0 && (
            <div className="tag-row shortlist-tags">
              {shortlistInsights.topTags.map((tagName) => (
                <span key={tagName}>{tag(tagName)}</span>
              ))}
            </div>
          )}
          {view === "developer" && <p className="supporting-note">{t(`Estimated catalog revenue: $${number(shortlistInsights.totalVisibleRevenue)}`, `目录估算营收：${number(shortlistInsights.totalVisibleRevenue)} 美元`)}</p>}
        </details>
      )}
    </>
  );
}
