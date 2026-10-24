import { GameProvenance } from "./GameProvenance";
import { ArrowLeft, ArrowUpRight, BarChart3, CircleDollarSign, Gamepad2, MessageSquare, Search, Sparkles, Star, Tags, Users } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Game } from "../types";
import type { useDiscovery } from "../hooks/useDiscovery";
import { useGameDetails } from "../hooks/useGameDetails";
import { getSignal } from "../lib/search";
import { useI18n } from "../i18n";
import { hasOriginalInsightContent, localizeGameInsights, localizeGameSummary } from "../i18n/content";
import { ErrorNotice } from "./ui";
import { SearchControls } from "./SearchControls";
import { GameArtwork } from "./GameArtwork";
import { ResearchOverview } from "./ResearchOverview";
import type { RecommendationFeed, RecommendationReason } from "../lib/recommendations";
import "./audience-workspace.css";

export function GameWorkspace({ discovery, renderSaveMenu, renderQuickActions, collectionPanel, recommendations, recommendationsLoading, recommendationsError, retryRecommendations }: {
  discovery: ReturnType<typeof useDiscovery>;
  renderSaveMenu: (game: Game) => ReactNode;
  renderQuickActions?: (game: Game) => ReactNode;
  collectionPanel: ReactNode;
  recommendations: RecommendationFeed;
  recommendationsLoading: boolean;
  recommendationsError: boolean;
  retryRecommendations: () => void;
}) {
  const { language, t, money, number, tag } = useI18n();
  const { catalog, selectedId, selectedPreview, view, filteredGames,
    catalogLoading, catalogError, retryCatalog, selectGame, isBrowsing, resetBrowse } = discovery;
  const [searchExpanded, setSearchExpanded] = useState(false);
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const featuredGame = useRef<HTMLElement>(null);
  const focusSelectedGame = useRef(false);
  useLayoutEffect(() => {
    if (!focusSelectedGame.current || !featuredGame.current) return;
    focusSelectedGame.current = false;
    featuredGame.current.focus({ preventScroll: true });
    featuredGame.current.scrollIntoView?.({ block: "start" });
  }, [selectedId]);
  const { selectedGame, visibleInsights, detailError, insightsError, detailLoading, retryDetails }
    = useGameDetails(selectedId, catalog, selectedPreview);
  const signal = visibleInsights?.signal ?? (selectedGame ? getSignal(selectedGame) : "Watch");
  const signalClass = `signal ${signal.toLowerCase()}`;
  const localizedInsights = selectedGame && visibleInsights ? localizeGameInsights(selectedGame, visibleInsights, language) : visibleInsights;
  const reviewInsight = localizedInsights?.reviewIntelligence;
  const originalRecommendation = view === "developer" ? visibleInsights?.developerOpportunity : visibleInsights?.playerRecommendation;
  const selectedRecommendation = view === "developer" ? localizedInsights?.developerOpportunity : localizedInsights?.playerRecommendation;
  const originalRecommendationText = originalRecommendation && selectedRecommendation && hasOriginalInsightContent(originalRecommendation, selectedRecommendation, language);
  const originalReviewText = visibleInsights && reviewInsight && hasOriginalInsightContent(visibleInsights.reviewIntelligence, reviewInsight, language);
  const insightSource = visibleInsights?.source === "deepseek" ? "DeepSeek" : t("Game details", "游戏资料");
  const signalLabel = signal === "Strong" ? t("Strong", "强劲") : signal === "Watch" ? t("Watch", "关注") : t("Risk", "风险");
  const gameSummary = selectedGame ? localizeGameSummary(selectedGame, language) : "";
  const isDeveloper = view === "developer";
  const personalBrowse = !isDeveloper && isBrowsing;
  const personalized = personalBrowse && recommendations.personalized && !recommendationsLoading;
  const reasonsById = new Map(recommendations.items.map((item) => [item.game.id, item.reasons]));
  const selectedIsRecommended = personalized && selectedId !== null && reasonsById.has(selectedId);
  const searchVisible = !isBrowsing || searchExpanded;
  function returnToBrowse() {
    focusSelectedGame.current = false;
    resetBrowse();
    setSearchExpanded(false);
    workspaceHeading.current?.focus();
  }

  return (
    <main className={`workspace workspace--${view}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{isDeveloper ? <BarChart3 size={14} aria-hidden="true" /> : <Gamepad2 size={14} aria-hidden="true" />} {isDeveloper ? t("Research / Compare / Create", "研究 / 对照 / 创作") : t("Discover / Play / Repeat", "发现 / 畅玩 / 再来一局")}</p>
          <h2 ref={workspaceHeading} tabIndex={-1}>{isDeveloper ? isBrowsing ? <>{t("Research ", "研究")}<span>{t("overview", "概览")}</span></> : <>{t("Find your next ", "寻找下一个")}<span>{t("opportunity.", "创作机会。")}</span></> : isBrowsing ? <>{t("What will you ", "今天，")}<span>{t("play next?", "玩点什么？")}</span></> : <>{t("Find your next ", "发现你的下一款")}<span>{t("game.", "游戏。")}</span></>}</h2>
          <p className="audience-intro">{isDeveloper ? isBrowsing ? t("Get to know the catalog, choose a genre, or inspect a game to start your research.", "先了解目录，选择感兴趣的类型，或从一款参考作品开始研究。") : t("Explore comparable games, inspect catalog signals, and build a research shortlist.", "探索同类游戏，查看目录数据与机会分析，建立你的研究清单。") : isBrowsing ? personalized ? t("Follow your favorites into a new adventure, or return to a game you want to try.", "沿着你的喜好，发现下一场冒险，也看看那些一直想玩的作品。") : t("Start with a few standout games. Pick one to explore, or search for something on your mind.", "先从几款参考作品逛起。挑一款看看，或搜索你已经感兴趣的游戏。") : t("Discover games for your taste and budget, then save your next adventure.", "按喜好和预算发现游戏，收藏你的下一场冒险。")}</p>
        </div>
        <div className="workspace-actions">
          {(searchVisible || (isDeveloper && selectedId !== null)) && <button className="browse-search-button" type="button" onClick={returnToBrowse}><ArrowLeft size={16} aria-hidden="true" />{isDeveloper ? t("Back to overview", "返回概览") : t("Back to recommendations", "返回推荐")}</button>}
          {!searchVisible && <button className="browse-search-button" type="button" onClick={() => setSearchExpanded(true)}><Search size={16} aria-hidden="true" />{isDeveloper ? t("Search catalog", "搜索游戏库") : t("Search games", "搜索游戏")}</button>}
        </div>
      </header>
      {searchVisible && <SearchControls discovery={discovery} onReturnToBrowse={returnToBrowse} />}
      {catalogLoading && <p role="status" className="mode-description">{t("Loading game catalog…", "正在加载游戏库…")}</p>}
      {catalogError && <ErrorNotice message={catalogError} onRetry={retryCatalog} retryLabel={t("Retry catalog", "重新加载游戏库")} disabled={catalogLoading} />}
      {personalBrowse && !catalogLoading && !catalogError && <div className="recommendation-controls">
        {recommendationsLoading ? <p role="status">{t("Finding your next game…", "正在挑选适合你的游戏…")}</p>
          : recommendationsError ? <p role="status">{t("Your preferences could not be loaded. Showing general picks for now.", "暂时无法加载你的偏好，先看看精选游戏。")}</p>
            : <p>{personalized ? t("Shaped by your preferences and game library.", "根据你的偏好与游戏库挑选。") : t("Make these picks yours with a few favorite games or genres.", "记录几款喜欢的游戏或类型，让推荐更合你的口味。")}</p>}
        <div>{recommendationsError && !recommendationsLoading && <button className="small-button" type="button" onClick={retryRecommendations}>{t("Retry preferences", "重新加载偏好")}</button>}
          <a className="small-button" href="#player/profile">{personalized ? t("Adjust my taste", "调整我的偏好") : t("Set my preferences", "设置我的偏好")}</a></div>
      </div>}
      {isDeveloper && isBrowsing && !catalogLoading && !catalogError && <ResearchOverview catalog={catalog} onResearchTag={(gameTag) => discovery.updateIntent({ tags: [gameTag] })} />}
      {detailError && <ErrorNotice message={detailError} onRetry={retryDetails} retryLabel={t("Retry game details", "重新加载游戏详情")} disabled={detailLoading} />}

      {selectedGame && (
        <section className="feature-band" ref={featuredGame} tabIndex={-1} aria-label={t("Game details", "游戏详情")}>
          <GameArtwork key={selectedGame.name} name={selectedGame.name} className="feature-artwork" priority />
          <div className="feature-shade" aria-hidden="true" />
          <div className="feature-copy">
            <div className="feature-kicker"><span /> {isDeveloper ? t("Research focus", "研究对象") : selectedIsRecommended ? t("Picked for you", "为你挑选") : personalBrowse && !personalized ? t("Featured pick", "精选游戏") : t("In focus", "正在查看")}</div>
            <p className="feature-genres">{selectedGame.tags.slice(0, 3).map(tag).join(" / ")}</p>
            <h2>{selectedGame.name}</h2>
            <p className="feature-summary">{gameSummary}</p>
            {selectedIsRecommended && <div className="feature-reasons" aria-label={t("Why this pick", "推荐理由")}>
              {(reasonsById.get(selectedGame.id) ?? []).map((reason, index) => <p key={index}><RecommendationReasonText reason={reason} /></p>)}
            </div>}
            {language === "zh" && selectedGame.summary && gameSummary === selectedGame.summary && <p className="supporting-note">{t("Original content", "原始内容")}</p>}
            <p className="feature-byline">{selectedGame.developer} <span aria-hidden="true">·</span> {selectedGame.releaseYear}</p>
            <div className="feature-stats">
              <Stat icon={<Star size={15} aria-hidden="true" />} label={selectedGame.metricsKind === "demo" ? t("Demo rating", "演示评分") : t("Unverified rating", "未核实评分")} value={`${selectedGame.rating.toFixed(1)} / 5`} />
              <Stat icon={<CircleDollarSign size={15} aria-hidden="true" />} label={selectedGame.metricsKind === "demo" ? t("Demo price", "演示价格") : t("Unverified price", "未核实价格")} value={money(selectedGame.price)} />
              {renderSaveMenu(selectedGame)}
            </div>
            {renderQuickActions?.(selectedGame)}
            <GameProvenance game={selectedGame} />
          </div>
        </section>
      )}

      {isDeveloper && selectedGame && (
        <section className="research-metrics" aria-label={t("Research metrics", "研究数据")}>
          <div className="research-metric-values">
            <Stat icon={<MessageSquare size={15} aria-hidden="true" />} label={t("Review count", "评价数量")} value={number(selectedGame.reviewCount)} />
            <Stat icon={<Users size={15} aria-hidden="true" />} label={t("Estimated ownership", "估算拥有量")} value={number(selectedGame.ownership)} />
            <Stat icon={<CircleDollarSign size={15} aria-hidden="true" />} label={t("Estimated revenue · USD", "估算营收 · 美元")} value={`US$${number(selectedGame.revenue)}`} />
          </div>
          <p>{selectedGame.metricsKind === "demo" ? t("Demonstration metrics · Synthetic review counts, ownership and revenue.", "演示指标 · 评价数、拥有量和营收均为合成值。") : t("Metric sources are unverified.", "指标来源尚未核实。")}</p>
        </section>
      )}

      <section className="content-grid">
        <div className="catalog-panel">
          <div className="section-heading">
            <h2>
              <Tags size={16} aria-hidden="true" />
              {isDeveloper ? isBrowsing ? t("Research starting points", "研究参考作品") : t("Research results", "研究结果") : isBrowsing ? personalized ? t("For you", "为你推荐") : t("Recommended games", "精选推荐") : t("Matching Games", "匹配游戏")}
            </h2>
            <span>
              {isBrowsing ? isDeveloper ? t(`${filteredGames.length} references`, `${filteredGames.length} 款参考`) : t(`${filteredGames.length} picks`, `${filteredGames.length} 款精选`) : t(`${filteredGames.length} ${filteredGames.length === 1 ? "result" : "results"}`, `${filteredGames.length} 个结果`)}
            </span>
          </div>
          {isBrowsing && <p className="recommendation-basis">{isDeveloper ? t("Start with the most-reviewed titles in this catalog. Select one to inspect its signals.", "从当前目录中评价较多的作品开始，选择一款查看分析依据。") : personalized ? t("New discoveries and games you want to try. Playing, played and avoided games stay out of this list.", "发现新作品，也重拾想玩的游戏；已玩、在玩和不合口味的作品不会出现在这里。") : t("A few highly rated games to start exploring.", "从几款高评分作品开始探索。")}</p>}
          <div className={`game-list${isBrowsing ? " recommendation-grid" : ""}`}>
            {filteredGames.map((game) => (
              <button
                key={game.id}
                className={`game-card ${selectedGame?.id === game.id ? "selected" : ""}`}
                type="button"
                aria-pressed={selectedGame?.id === game.id}
                onClick={() => {
                  selectGame(game.id);
                  if (isBrowsing) {
                    if (selectedId !== game.id) focusSelectedGame.current = true;
                    else {
                      featuredGame.current?.focus({ preventScroll: true });
                      featuredGame.current?.scrollIntoView?.({ block: "start" });
                    }
                  }
                }}
              >
                <GameArtwork name={game.name} className="result-artwork" />
                <div className="game-card-copy">
                  <h3>{game.name}</h3>
                  <div className="tag-row">
                    {game.tags.map((gameTag) => (
                      <span key={gameTag}>{tag(gameTag)}</span>
                    ))}
                  </div>
                  {personalized && reasonsById.get(game.id)?.[0] && <p className="recommendation-reason"><RecommendationReasonText reason={reasonsById.get(game.id)![0]} /></p>}
                </div>
                <div className="game-meta">
                  <small>{game.metricsKind === "demo" ? t("Demo values", "演示数值") : t("Unverified", "未核实")}</small>
                  <strong>{isDeveloper ? t(`${number(game.reviewCount)} reviews`, `${number(game.reviewCount)} 条评价`) : money(game.price)}</strong>
                  <span>{t(`${game.rating.toFixed(1)} rating`, `${game.rating.toFixed(1)} 分`)}</span>
                  <ArrowUpRight size={16} className="game-card-arrow" aria-hidden="true" />
                </div>
              </button>
            ))}
            {filteredGames.length === 0 && !catalogLoading && !catalogError && !(personalBrowse && recommendationsLoading) && (
              <div className="empty-state">
                {!isBrowsing ? t("No games match these filters.", "没有符合这些筛选条件的游戏。")
                  : isDeveloper ? t("There are no games in this catalog to research yet.", "游戏目录暂无可研究的作品。")
                    : personalized && catalog.length > 0 ? <>
                      {t("No new games fit your current preferences.", "暂时没有符合当前偏好的新游戏。打算换个口味吗？")}
                      <p>{t("Adjust your preferences above, or search the full catalog.", "可以调整上方的偏好，或搜索完整游戏库。")}</p>
                    </> : t("There are no games to recommend yet.", "游戏目录暂无可推荐的游戏。")}
                {!isBrowsing && <p>{isDeveloper
                  ? t("Try another query or return to the overview to explore a genre.", "试试其他条件，或返回概览，从游戏类型开始研究。")
                  : t("Try another title or return to recommendations to keep exploring.", "试试其他游戏名，或返回推荐继续探索。")}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="insight-stack">
          {insightsError && <ErrorNotice message={insightsError} onRetry={retryDetails} retryLabel={t("Retry game intelligence", "重新加载游戏洞察")} disabled={detailLoading} />}
          <section className="insight-panel">
            <div className="section-heading">
              <h2>
                {view === "developer" ? <BarChart3 size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                {isDeveloper ? selectedGame ? t("Catalog analysis", "游戏库分析") : t("Start a game analysis", "开始游戏分析") : t("Game insights", "游戏洞察")}
              </h2>
              {visibleInsights && <span className="source-label">{insightSource}</span>}
            </div>
            <p className="insight-verdict">{selectedRecommendation?.body ?? (detailLoading ? t("Loading game insights…", "正在加载游戏洞察…") : selectedGame ? t("Game insights are unavailable.", "暂时无法获取游戏洞察。") : isDeveloper ? t("Choose a reference game to explore its pricing, reception, and development opportunities.", "选择一款参考作品，了解定价、评价表现和开发机会。") : t("Select a game to inspect recommendation signals.", "选择一款游戏，查看推荐依据。"))}</p>
            {isDeveloper && !selectedGame && <p className="supporting-note insight-basis">{t("Game analysis shows its source and supporting signals. Save useful references to a research collection.", "游戏分析会标明来源与依据，你也可以将有用的参考作品加入收藏夹。")}</p>}
            {originalRecommendationText && <p className="supporting-note">{t("Original content", "原始内容")}</p>}
            {visibleInsights && <p className="supporting-note insight-basis">{t("Based on catalog tags; no review text analyzed.", "依据目录标签，未分析评论原文。")}</p>}
            {view === "developer" && selectedGame && <p className="supporting-note">{selectedGame.metricsKind === "demo" ? t("Synthetic demonstration metrics", "合成演示指标") : t("Unverified metrics", "指标未核实")}</p>}
            {selectedGame && visibleInsights && (
              <details className="insight-disclosure" key={`${selectedGame.id}-${view}`}>
                <summary>{isDeveloper ? t("Analysis details and evidence", "分析详情与依据") : t("More game signals", "更多游戏信号")}</summary>
                <p>{t("Catalog signal: ", "目录信号：")}<strong className={signalClass}>{signalLabel}</strong></p>
                {selectedRecommendation && <InsightBullets bullets={selectedRecommendation.bullets} />}
                {reviewInsight && (
                  <div className="catalog-commentary">
                    <h3>{t("Catalog signal commentary", "目录信号解读")}</h3>
                    <p className="supporting-note">{t("See how the game's genres, rating and review count compare.", "结合游戏类型，查看评分与评价数量的表现。")}</p>
                    {originalReviewText && <p className="supporting-note">{t("Original content", "原始内容")}</p>}
                    <p>{reviewInsight.body}</p>
                    <InsightBullets bullets={reviewInsight.bullets} />
                  </div>
                )}
              </details>
            )}
          </section>
          {collectionPanel}
        </div>
      </section>
    </main>
  );
}

function RecommendationReasonText({ reason }: { reason: RecommendationReason }) {
  const { t, tag } = useI18n();
  if (reason.kind === "preferred") return <>{t(`Matches your preference: ${reason.tags.map(tag).join(" · ")}`, `符合你的偏好：${reason.tags.map(tag).join(" · ")}`)}</>;
  if (reason.kind === "interest") return <>{t(`From your interests: ${tag(reason.tag)}, like ${reason.gameName}`, `与你喜欢或收藏的 ${reason.gameName} 同属${tag(reason.tag)}`)}</>;
  if (reason.kind === "history") return <>{t(`Explore more ${tag(reason.tag)} after ${reason.gameName}`, `玩过 ${reason.gameName}，再探索一款${tag(reason.tag)}游戏`)}</>;
  if (reason.kind === "wishlist") return <>{t("On your want-to-play list", "来自你的想玩清单")}</>;
  if (reason.kind === "explore") return <>{t("Something different to explore", "换个口味，探索不同作品")}</>;
  return <>{t("A highly rated catalog pick", "高评分精选作品")}</>;
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-tile">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightBullets({ bullets }: { bullets: string[] }) {
  if (bullets.length === 0) return null;
  return <ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>;
}
