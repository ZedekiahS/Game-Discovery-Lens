import { useAccountDraft } from "../hooks/useAccountDraft";
import { useEffect, useState } from "react";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { Compass, Heart, SlidersHorizontal, X } from "lucide-react";
import type { Game, PlayerPreferences, PlayerPreferencesSnapshot } from "../types";
import { useI18n } from "../i18n";
import { buildPlayerProfile } from "../lib/playerProfile";
import { availableTagChoices, conflictsWithExclusions } from '../lib/tagSemantics';
import { GameArtwork } from "./GameArtwork";
import { ErrorNotice } from './ui';
import { PlayerPageStatus, playerPageReady, type PlayerPageProps } from "./PlayerLibraryPage";

export function PlayerProfilePage(props: PlayerPageProps) {
  const { catalog, collections, library } = props;
  const { t, tag } = useI18n();
  const profile = buildPlayerProfile(catalog, library.records, collections.collections, collections.savedGamesByCollection, library.preferences);
  const tags = availableTagChoices(catalog.flatMap((g) => g.tags)).sort((a, b) => tag(a).localeCompare(tag(b)));
  const ready = playerPageReady(props);
  return <main className="workspace player-page">
    <header className="player-page-heading"><div><p className="eyebrow"><Compass size={16} aria-hidden="true" />{t("A TASTE OF YOUR WORLDS", "你的游戏，你的风格")}</p><h2>{t("My gaming taste", "玩家画像")}</h2><p>{t("See what draws you in, and make room for your next discovery.", "看看哪些世界吸引着你，也为下一次发现留点空间。")}</p></div><a className="small-button" href="#player/library">{t("Manage my games", "管理我的游戏")}</a></header>
    <PlayerPageStatus {...props} libraryFeedback={!ready} />
    {ready && <>
      <section className="taste-hero">
        <div><p className="eyebrow"><Heart size={16} aria-hidden="true" />{t("YOUR INTERESTS", "兴趣足迹")}</p><h3>{profile.interestCount ? t("Your games tell a story", "你的游戏，藏着你的偏好") : t("Make this space yours", "从你的喜好开始")}</h3>
          <p>{profile.interestCount ? t(`Based on ${profile.interestCount} distinct ${profile.interestCount === 1 ? "game" : "games"} you like or personally collect.`, `依据你喜欢或个人收藏的 ${profile.interestCount} 款不同游戏。`) : t("Mark a few games you like, or choose your favorite genres below.", "标记几款喜欢的游戏，或在下方选择感兴趣的类型。")}</p>
          {library.preferences.preferredTags.length > 0 && <p className="supporting-note">{t("Your chosen preferences", "你主动选择的偏好")}</p>}
          <div className="taste-tags">{(library.preferences.preferredTags.length ? library.preferences.preferredTags : profile.interests.slice(0, 4).map((s) => s.tag)).map((name) => <span key={name}>{tag(name)}</span>)}</div>
          {!profile.interestCount && <a href="#player/library" className="primary-button">{t("Choose a few games", "挑几款喜欢的游戏")}</a>}
        </div>
        <div className="taste-hero-art" aria-hidden="true">{profile.representatives.slice(0, 3).map((game) => <GameArtwork key={game.id} name={game.name} />)}{!profile.representatives.length && <Compass size={110} strokeWidth={0.8} />}</div>
      </section>
      <div className="taste-columns">
        <Distribution title={t("What catches your eye", "你偏爱的类型与风格")} description={t("Games you like and personal collections. Expand a type to see its games.", "来自喜欢的游戏与个人喜好收藏。展开类型可查看依据。")} rows={profile.interests} total={profile.interestCount} empty={t("No game-based interests yet. Research and unclassified collections are not included.", "还没有基于游戏的兴趣记录。研究参考和尚未分类的收藏不会计入。")}/>
        <Distribution title={t("What you have been playing", "你玩过哪些类型")} description={t("Counts of games marked Playing or Played, not hours played. A game can have several tags.", "按“在玩”和“已玩”的游戏数量统计；一款游戏可包含多个类型。") } rows={profile.played} total={profile.playedCount} empty={t("Mark a game as Playing or Played to start your play history.", "将游戏标记为“在玩”或“已玩”，开始记录你的游玩经历。")}/>
      </div>
      <PreferencesEditor userId={props.userId} preferences={library.preferences} tags={tags} library={library} />
      {profile.representatives.length > 0 && <section className="taste-favorites"><div className="section-heading"><h3>{t("Games you love", "你喜欢的作品")}</h3><a href="#player/library">{t("Edit in my games", "去游戏库编辑")}</a></div><div className="taste-favorite-grid">{profile.representatives.map((game) => <article key={game.id}><GameArtwork name={game.name} /><h4>{game.name}</h4><p>{game.tags.slice(0, 2).map(tag).join(" · ")}</p></article>)}</div></section>}
    </>}
  </main>;
}

function Distribution({ title, description, rows, total, empty }: { title: string; description: string; rows: Array<{ tag: string; games: Game[] }>; total: number; empty: string }) {
  const { tag, t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return <section className="taste-distribution"><h3>{title}</h3><p>{description}</p>{rows.length ? <>
    {(expanded ? rows : rows.slice(0, 6)).map((row) => <details key={row.tag}><summary><span>{tag(row.tag)}</span><span>{t(`${row.games.length} ${row.games.length === 1 ? "game" : "games"}`, `${row.games.length} 款`)}</span><span className="taste-bar" aria-hidden="true"><span style={{ width: `${row.games.length / total * 100}%` }} /></span></summary><ul>{row.games.map((g) => <li key={g.id}>{g.name}</li>)}</ul></details>)}
    {rows.length > 6 && <button className="small-button" onClick={() => setExpanded(!expanded)}>{expanded ? t("Show less", "收起") : t("See all types", "查看全部类型")}</button>}
  </> : <div className="taste-empty"><Compass size={28} aria-hidden="true" /><p>{empty}</p><a href="#player/library">{t("Open my games", "打开我的游戏库")}</a></div>}</section>;
}

function PreferencesEditor({ userId, preferences, tags, library }: { userId: string | null; preferences: PlayerPreferencesSnapshot; tags: string[]; library: PlayerPageProps['library'] }) {
  const { t, tag, error } = useI18n();
  const disabled = library.busy || library.loading || !!library.error;
  const saving = library.busy;
  const choices = (p: PlayerPreferences): PlayerPreferences => ({ preferredTags: p.preferredTags, avoidedTags: p.avoidedTags });
  const [edit, setEdit, discardDraft, restored] = useAccountDraft(userId, "preferences", { base: preferences, value: choices(preferences) });
  const draft = edit.value;
  const setDraft = (value: PlayerPreferences) => setEdit({ ...edit, value });
  const [saved, setSaved] = useState(false);
  const same = (a: PlayerPreferences, b: PlayerPreferences) =>
    (['preferredTags', 'avoidedTags'] as const).every(field => JSON.stringify([...a[field]].sort()) === JSON.stringify([...b[field]].sort()));
  const dirty = !same(draft, edit.base);
  const stale = edit.base.version !== preferences.version;
  useEffect(() => {
    // Refresh clean forms; reconcile a committed write whose response was lost.
    // Dirty, different choices retain the original version until the player reviews them.
    if (stale && (!dirty || same(draft, preferences))) {
      setEdit({ base: preferences, value: choices(preferences) });
      discardDraft();
      if (!dirty) setSaved(false);
    }
  }, [preferences, stale, dirty]);
  function resolveConflict(keepDraft: boolean) {
    setEdit({ base: preferences, value: keepDraft ? draft : choices(preferences) });
    setSaved(false);
    if (!keepDraft) discardDraft();
  }
  const confirmDiscard = useUnsavedChanges(dirty, discardDraft);
  return <section className="taste-preferences"><div className="section-heading"><h3><SlidersHorizontal size={18} aria-hidden="true" />{t("Make your preferences explicit", "你的偏好，由你决定")}</h3></div><p>{t("Choose what you enjoy and what you prefer to avoid. You can change these anytime.", "选出你偏爱的类型，以及不合口味的类型，随时都可以调整。")}</p>
    <form onSubmit={async (e) => { e.preventDefault(); if (!disabled && !stale && dirty && await library.savePreferences(draft, edit.base.version)) { discardDraft(); setSaved(true); } }}>
      {library.error && <ErrorNotice message={library.error === 'Your changes could not be confirmed. Reload your library before trying again.'
        ? t('Your preference changes could not be confirmed. Reload preferences before trying again.', '无法确认偏好是否已保存，请重新加载偏好后再试。') : library.error}
        onRetry={library.retry} retryLabel={t('Reload preferences', '重新加载偏好')} disabled={library.busy || library.loading} />}
      {library.rejection && <p role="alert">{error(library.rejection)}</p>}
      {restored && dirty && <p role="status">{t('Your unsaved choices were restored. Review them before saving.', '已恢复你的未保存选择，请核对后再保存。')}</p>}
      {stale && dirty && <section className="record-conflict" aria-label={t('Review preference changes', '核对偏好变化')}>
        <p role="alert">{t('Your preferences changed elsewhere. Your unsaved choices are still here.', '偏好已在别处更改，你的未保存选择仍在这里。')}</p>
        <strong>{t('Latest saved preferences', '最新保存的偏好')}</strong>
        <p>{t('More of this', '更偏爱')}: {preferences.preferredTags.map(tag).join(' · ') || t('None chosen', '尚未选择')}</p>
        <p>{t('Less of this', '不合口味')}: {preferences.avoidedTags.map(tag).join(' · ') || t('None chosen', '尚未选择')}</p>
        <p>{t('Keeping your choices replaces both saved lists only after you press Save preferences.', '选择保留当前选择后，仍需点击“保存偏好”才会替换这两组已保存内容。')}</p>
        <div className="record-actions"><button type="button" className="small-button" disabled={disabled} onClick={() => resolveConflict(false)}>{t('Use saved preferences', '使用已保存偏好')}</button><button type="button" className="small-button" disabled={disabled} onClick={() => resolveConflict(true)}>{t('Keep my choices', '保留当前选择')}</button></div>
      </section>}
      <div className="preference-columns">{(["preferredTags", "avoidedTags"] as const).map((field) => <div key={field}>
        <label className="field"><span>{field === "preferredTags" ? t("More of this", "更偏爱") : t("Less of this", "不合口味")}</span><select value="" disabled={disabled || draft[field].length >= 12} onChange={(e) => { const value = e.target.value; if (value) { setDraft(field === 'preferredTags'
          ? { preferredTags: [...draft.preferredTags, value], avoidedTags: draft.avoidedTags.filter(v => !conflictsWithExclusions(value, [v])) }
          : { avoidedTags: [...draft.avoidedTags, value], preferredTags: draft.preferredTags.filter(v => !conflictsWithExclusions(v, [value])) }); setSaved(false); } }}><option value="">{t("Choose a type or style", "选择类型或风格")}</option>{tags.filter((v) => !draft[field].includes(v)).map((v) => <option key={v} value={v}>{tag(v)}</option>)}</select></label>
        <div className="preference-chips">{draft[field].map((v) => <button type="button" key={v} disabled={disabled} onClick={() => { setDraft({ ...draft, [field]: draft[field].filter((n) => n !== v) }); setSaved(false); }} aria-label={t(`Remove ${tag(v)} from ${field === "preferredTags" ? "preferred" : "avoided"} types`, `从${field === "preferredTags" ? "偏爱" : "不合口味"}中移除${tag(v)}`)}>{tag(v)}<X size={14} aria-hidden="true" /></button>)}</div>
      </div>)}</div>
      {[...draft.preferredTags, ...draft.avoidedTags].some(v => v === 'Multiplayer' || v === 'Co-op') && <p className="supporting-note">{t('Multiplayer includes online and local co-op tags. Singleplayer does not mean singleplayer-only.', '多人也包含在线及本地合作标签；单人标签不代表仅限单人。')}</p>}
      <div className="record-actions"><button className="primary-button" type="submit" disabled={disabled || stale || !dirty}>{saving ? t("Saving…", "正在保存…") : t("Save preferences", "保存偏好")}</button>{dirty && <button type="button" className="small-button" disabled={disabled} onClick={() => { if (confirmDiscard()) resolveConflict(false); }}>{t("Cancel changes", "取消更改")}</button>}{saved && !stale && !dirty && <span role="status">{t("Preferences saved", "偏好已保存")}</span>}</div>
    </form>
  </section>;
}
