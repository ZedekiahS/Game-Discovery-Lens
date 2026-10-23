import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, Heart, Plus, Search, X } from "lucide-react";
import type { useCollections } from "../hooks/useCollections";
import type { usePlayerLibrary } from "../hooks/usePlayerLibrary";
import type { Game, GameAffinity, PlayerGameInput, PlayerGameRecord, PlayStatus } from "../types";
import { useI18n } from "../i18n";
import { localizeGameSummary } from "../i18n/content";
import { DATA_MODE } from "../services/runtime";
import { GameArtwork } from "./GameArtwork";
import { CollectionsPanel } from "./CollectionsPanel";
import { SaveGameMenu } from "./SaveGameMenu";
import { ErrorNotice } from "./ui";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { createLibraryView, sortLibraryGames, type LibrarySort, type LibraryViewMemory } from "../lib/libraryView";

export interface PlayerPageProps {
  catalog: Game[];
  catalogLoading: boolean;
  catalogError: string;
  retryCatalog: () => void;
  library: ReturnType<typeof usePlayerLibrary>;
  collections: ReturnType<typeof useCollections>;
  userId: string | null;
}

export function PlayerPageStatus({ catalogLoading, catalogError, retryCatalog, library, collections, userId }: PlayerPageProps) {
  const { t } = useI18n();
  return <>
    {!userId && <p className="player-empty">{t("Sign in above to keep your games and preferences together.", "登录后即可管理你的游戏与偏好。")}</p>}
    {(catalogLoading || library.loading || collections.loading) && <p role="status">{t("Loading your games…", "正在加载你的游戏…")}</p>}
    {catalogError && <ErrorNotice message={catalogError} onRetry={retryCatalog} />}
    {library.error && <ErrorNotice message={library.error} onRetry={library.retry} disabled={library.busy} />}
    {collections.error && <ErrorNotice message={collections.error} onRetry={collections.retry} disabled={collections.busy} />}
  </>;
}

export const playerPageReady = (p: PlayerPageProps) => !!p.userId && !p.catalogLoading && !p.catalogError
  && p.library.loaded && !p.collections.loading && !p.collections.error;

export function PlayerLibraryPage(props: PlayerPageProps & { startGameId: number | null; memory?: LibraryViewMemory }) {
  const { catalog, library, collections, userId, startGameId } = props;
  const { t, tag, collectionName } = useI18n();
  const [view, setView] = useState(props.memory?.view ?? createLibraryView());
  const { query, shelf, collectionFilter, adding, sort } = view;
  const setQuery = (query: string) => setView((v) => ({ ...v, query }));
  const setShelf = (shelf: string) => setView((v) => ({ ...v, shelf }));
  const setCollectionFilter = (collectionFilter: string) => setView((v) => ({ ...v, collectionFilter }));
  const setAdding = (adding: boolean) => setView((v) => ({ ...v, adding }));
  const enteredForRecord = useRef(startGameId !== null);
  useEffect(() => { if (props.memory) props.memory.view = view; }, [view, props.memory]);
  const [selectedId, setSelectedId] = useState<number | null>(startGameId);
  const [notice, setNotice] = useState<"saved" | "removed" | null>(null);
  const records = useMemo(() => new Map(library.records.map((r) => [r.gameId, r])), [library.records]);
  const savedIds = new Set(Object.values(collections.savedGamesByCollection).flat().map((r) => r.gameId));
  const libraryIds = new Set([...records.keys(), ...savedIds]);
  const inCollection = collectionFilter ? new Set((collections.savedGamesByCollection[Number(collectionFilter)] ?? []).map((r) => r.gameId)) : null;
  const games = sortLibraryGames(catalog.filter((g) => (adding || libraryIds.has(g.id))
    && (!inCollection || inCollection.has(g.id))
    && (shelf === "all" || (shelf === "liked" ? records.get(g.id)?.affinity === "like" : records.get(g.id)?.status === shelf))
    && `${g.name} ${g.tags.map(tag).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())), sort, library.records, Object.values(collections.savedGamesByCollection).flat());
  const selectedGame = catalog.find((g) => g.id === selectedId);
  const ready = playerPageReady(props);
  useEffect(() => {
    if (!ready || !props.memory) return;
    const memory = props.memory;
    let restored = false;
    const frame = window.requestAnimationFrame(() => {
      if (!enteredForRecord.current) {
        document.querySelector<HTMLButtonElement>(`[data-library-game="${memory.gameId}"]`)?.focus({ preventScroll: true });
        window.scrollTo(0, memory.scrollY);
      } else window.scrollTo(0, 0);
      restored = true;
    });
    const rememberScroll = () => { if (restored) memory.scrollY = window.scrollY; };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", rememberScroll); };
  }, [ready, props.memory]);

  return <main className="workspace player-page">
    <header className="player-page-heading">
      <div><p className="eyebrow"><BookOpen size={16} aria-hidden="true" />{t("YOUR NEXT ADVENTURE", "下一场冒险，由你收藏")}</p>
        <h2>{t("My games", "我的游戏库")}</h2><p>{t("The games you want to try, the worlds you are in, and the ones that stay with you.", "想玩的、正在玩的，还有那些让你念念不忘的世界。")}</p></div>
      <button className="primary-button" disabled={!ready} onClick={() => { setAdding(!adding); setShelf("all"); setCollectionFilter(""); setQuery(""); }}><Plus size={16} aria-hidden="true" />{adding ? t("Back to my games", "返回我的游戏") : t("Add games", "添加游戏")}</button>
    </header>
    <PlayerPageStatus {...props} />
    {ready && <>
      <div className="library-shelves" role="group" aria-label={t("Game shelves", "游戏分类")}>
        {([['all', t('All games', '全部')], ['want_to_play', t('Want to play', '想玩')], ['playing', t('Playing', '在玩')], ['played', t('Played', '已玩')], ['liked', t('Liked', '喜欢')]] as const).map(([value, label]) => <button key={value} aria-pressed={shelf === value} onClick={() => { setShelf(value); setAdding(false); }}>
          {label}<span>{value === "all" ? libraryIds.size : library.records.filter((r) => value === "liked" ? r.affinity === "like" : r.status === value).length}</span>
        </button>)}
      </div>
      <div className="library-layout">
        <section aria-label={t("Game library", "游戏列表")}>
          <div className="library-tools">
            <label className="library-search"><Search size={17} aria-hidden="true" /><span className="sr-only">{t("Find a game", "查找游戏")}</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search titles or genres", "搜索游戏名或类型")} /></label>
            <label className="field"><span>{t("Show collection", "筛选收藏夹")}</span><select value={collectionFilter} onChange={(e) => setCollectionFilter(e.target.value)}><option value="">{t("All collections", "全部收藏夹")}</option>{collections.collections.map((c) => <option key={c.id} value={c.id}>{collectionName(c.name)}</option>)}</select></label>
            <label className="field"><span>{t("Sort games", "游戏排序")}</span><select value={sort} onChange={(e) => setView((v) => ({ ...v, sort: e.target.value as LibrarySort }))}>
              <option value="updated">{t("Recently updated", "最近更新")}</option><option value="collected">{t("Recently collected", "最近收藏")}</option><option value="name">{t("Game name", "游戏名称")}</option>
            </select></label>
          </div>
          <div className="library-results-heading"><h3>{adding ? t("Find your next game", "把下一款游戏收入囊中") : t("Your shelf", "你的游戏架")}</h3><span>{t(`${games.length} ${games.length === 1 ? "game" : "games"}`, `${games.length} 款游戏`)}</span></div>
          {notice && <p className="library-notice" role="status"><Check size={15} aria-hidden="true" />{notice === "saved" ? t("Game record saved.", "游戏记录已保存。") : t("Game record removed.", "游戏记录已移除。")}</p>}
          <div className="library-grid">{games.map((game) => {
            const record = records.get(game.id);
            return <button className="library-game" data-library-game={game.id} key={game.id} onClick={() => { if (props.memory) props.memory.gameId = game.id; setSelectedId(game.id); setNotice(null); }}>
              <GameArtwork name={game.name} className="library-cover" />
              <div className="library-game-copy"><h3>{game.name}</h3><p>{game.tags.slice(0, 2).map(tag).join(" · ")}</p>
                <div className="library-game-labels"><span>{record?.status ? statusLabel(record.status, t) : savedIds.has(game.id) ? t("Collected", "已收藏") : t("Add a record", "添加记录")}</span>{record?.affinity === "like" && <Heart size={15} aria-label={t("Liked", "喜欢")} />}{record?.affinity === "dislike" && <span>{t("Not for me", "不合口味")}</span>}</div>
              </div>
            </button>;
          })}</div>
          {games.length === 0 && <div className="player-empty"><BookOpen size={32} aria-hidden="true" /><h3>{libraryIds.size ? t("No games match this view", "没有符合条件的游戏") : t("Your shelf starts with one game", "从一款喜欢的游戏开始")}</h3><p>{libraryIds.size ? t("Try another title or clear the filters.", "试试其他游戏名，或清除筛选条件。") : t("Add a game, mark your progress, and keep a note for your next session.", "添加游戏，记录游玩状态，给下一次冒险留个备忘。")}</p><button className="small-button" onClick={() => { setAdding(true); setQuery(""); setShelf("all"); setCollectionFilter(""); }}>{t("Browse games", "浏览游戏")}</button></div>}
        </section>
        <aside className="library-collections"><CollectionsPanel state={collections} sessionUserId={userId} selectedId={selectedId} onSelectGame={setSelectedId} view="player" hideInsights />
          <a className="profile-link" href="#player/profile"><Heart size={18} aria-hidden="true" /><div><strong>{t("Explore your gaming taste", "看看你的玩家画像")}</strong><span>{t("Your interests, backed by your games", "从你的游戏中，发现自己的偏好")}</span></div></a>
          {DATA_MODE === "demo" && <p className="supporting-note">{t("Your records are saved in this browser.", "你的记录保存在此浏览器。")}</p>}
        </aside>
      </div>
    </>}
    {userId && library.loaded && selectedGame && <GameRecordEditor key={selectedGame.id} game={selectedGame} record={records.get(selectedGame.id)} library={library} collections={collections} userId={userId} onClose={() => setSelectedId(null)} onSaved={(kind) => { setNotice(kind); setSelectedId(null); }} />}
  </main>;
}

function statusLabel(status: PlayStatus, t: (en: string, zh: string) => string) {
  return status === "want_to_play" ? t("Want to play", "想玩") : status === "playing" ? t("Playing", "在玩") : t("Played", "已玩");
}

function GameRecordEditor({ game, record, library, collections, userId, onClose, onSaved }: { game: Game; record?: PlayerGameRecord; library: ReturnType<typeof usePlayerLibrary>; collections: ReturnType<typeof useCollections>; userId: string | null; onClose: () => void; onSaved: (kind: "saved" | "removed") => void }) {
  const { t, language } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PlayerGameInput>(() => ({ status: record?.status ?? null, affinity: record?.affinity ?? "neutral", notes: record?.notes ?? "" }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = draft.status !== (record?.status ?? null) || draft.affinity !== (record?.affinity ?? "neutral") || draft.notes !== (record?.notes ?? "");
  const confirmDiscard = useUnsavedChanges(dirty);
  const closeEditor = () => { if (confirmDiscard()) onClose(); };
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog className="game-record-dialog" ref={dialog} aria-labelledby="record-title" onCancel={(e) => { e.preventDefault(); if (!library.busy) closeEditor(); }}>
    <GameArtwork name={game.name} className="record-artwork" />
    <button className="record-close icon-button" type="button" aria-label={t("Close game record", "关闭游戏记录")} disabled={library.busy} onClick={closeEditor}><X size={20} aria-hidden="true" /></button>
    <form onSubmit={async (e) => { e.preventDefault(); if (await library.saveRecord(game.id, draft)) onSaved("saved"); }}>
      <p className="eyebrow">{t("YOUR GAME RECORD", "你的游戏记录")}</p><h2 id="record-title">{game.name}</h2>
      <p className="record-description">{localizeGameSummary(game, language)}</p>
      {library.loading && <p role="status">{t("Checking your saved record…", "正在确认已保存的记录…")}</p>}
      {library.error && <ErrorNotice message={library.error} onRetry={library.retry} disabled={library.loading} />}
      <label className="field"><span>{t("Play status", "游玩状态")}</span><select value={draft.status ?? ""} disabled={library.busy} onChange={(e) => setDraft({ ...draft, status: (e.target.value || null) as PlayStatus | null })}><option value="">{t("Not recorded", "尚未记录")}</option>{(["want_to_play", "playing", "played"] as const).map((s) => <option key={s} value={s}>{statusLabel(s, t)}</option>)}</select></label>
      <fieldset disabled={library.busy} className="affinity-options"><legend>{t("How do you feel about it?", "这款游戏合你的口味吗？")}</legend>{([["neutral", t("Undecided", "还没想好")], ["like", t("I like it", "喜欢")], ["dislike", t("Not for me", "不合口味")]] as const).map(([value, label]) => <label key={value}><input type="radio" name="affinity" value={value} checked={draft.affinity === value} onChange={() => setDraft({ ...draft, affinity: value as GameAffinity })} />{label}</label>)}</fieldset>
      <label className="field"><span>{t("Personal note", "个人笔记")}</span><textarea maxLength={500} rows={3} disabled={library.busy} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={t("What stood out? What will you try next?", "喜欢哪里？下次想尝试什么？")} /></label>
      <div className="record-actions"><button className="primary-button" disabled={library.busy || library.loading || !!library.error} type="submit">{library.busy ? t("Saving…", "正在保存…") : t("Save record", "保存记录")}</button><button className="small-button" type="button" onClick={closeEditor} disabled={library.busy}>{t("Cancel", "取消")}</button>{record && <button className="small-button danger" type="button" disabled={library.busy || library.loading || !!library.error} onClick={() => setConfirmDelete(true)}>{t("Remove record", "移除记录")}</button>}</div>
      {confirmDelete && <div className="record-confirm"><p>{t("Remove your status, preference and note for this game? It will stay in your collections.", "移除这款游戏的游玩状态、喜好和笔记？收藏夹中的游戏会保留。")}</p><button type="button" className="small-button danger" disabled={library.busy || library.loading || !!library.error} onClick={async () => { if (await library.removeRecord(game.id)) onSaved("removed"); }}>{t("Confirm removal", "确认移除")}</button><button className="small-button" type="button" onClick={() => setConfirmDelete(false)}>{t("Keep record", "保留记录")}</button></div>}
    </form>
    <div className="record-collection"><SaveGameMenu state={collections} sessionUserId={userId} game={game} /></div>
  </dialog>;
}
