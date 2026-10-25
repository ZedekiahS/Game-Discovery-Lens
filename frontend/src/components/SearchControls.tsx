import { SlidersHorizontal, Sparkles, X } from "lucide-react";
import { exampleQueries, type useDiscovery } from "../hooks/useDiscovery";
import { useI18n } from "../i18n";
import { localizeExampleQuery } from "../i18n/examples";
import { ErrorNotice } from "./ui";

function exampleLabel(query: string) {
  return query === "Celeste" ? "Celeste" : query.includes("FPS") ? "FPS rank" : query.includes("story") ? "Story picks" : query.includes("developer") ? "Dev lens" : "Survival deal";
}

const sortLabels = { name: "Name", price: "Price", rating: "Rating", review_count: "Review count", release_year: "Release year", revenue: "Revenue", ownership: "Ownership" };

export function SearchControls({ discovery, onReturnToBrowse }: { discovery: ReturnType<typeof useDiscovery>; onReturnToBrowse: () => void }) {
  const { language, t, money, tag } = useI18n();
  const { query, setQuery, intent, tags, priceCeiling, catalog, catalogLoading, view,
    searchError, searchLoading, runSearch, updateIntent, isBrowsing, conditionsEdited, clearFilters } = discovery;
  const isDeveloper = view === "developer";
  const primaryExamples = isDeveloper ? ["Dev lens", "FPS rank", "Story picks"] : ["Celeste", "Story picks", "Survival deal"];
  const displayQuery = localizeExampleQuery(query, language);
  const sortNames: Record<keyof typeof sortLabels, string> = {
    name: t("Name", "名称"), price: t("Price", "价格"), rating: t("Rating", "评分"),
    review_count: t("Review count", "评价数量"), release_year: t("Release year", "发行年份"),
    revenue: t("Estimated revenue", "估算营收"), ownership: t("Estimated ownership", "估算拥有量"),
  };
  const exampleLabels: Record<string, string> = {
    Celeste: "Celeste", "FPS rank": t("FPS rank", "射击游戏排行"), "Story picks": t("Story picks", "剧情佳作"),
    "Dev lens": t("Dev lens", "开发者视角"), "Survival deal": t("Survival deal", "生存好价"),
  };
  const excluded = intent.excludedTags ?? [];
  const activeFilters: { label: string; remove: () => void }[] = [];
  const add = (label: string, remove: () => void) => activeFilters.push({ label, remove });
  if (intent.titleQuery) add(t(`Title: ${intent.titleQuery}`, `名称：${intent.titleQuery}`), () => updateIntent({ titleQuery: null }));
  if (intent.maxPrice !== null) add(intent.maxPrice === 0 ? t("Free only", "仅免费") : t(`Up to ${money(intent.maxPrice)}`, `不超过 ${money(intent.maxPrice)}`), () => updateIntent({ maxPrice: null }));
  for (const value of intent.tags) add(t(`Include: ${tag(value)}`, `包含：${tag(value)}`), () => updateIntent({ tags: intent.tags.filter(v => v !== value) }));
  for (const value of excluded) add(t(`Exclude: ${tag(value)}`, `排除：${tag(value)}`), () => updateIntent({ excludedTags: excluded.filter(v => v !== value) }));
  if (intent.minRating > 0) add(t(`Rated ${intent.minRating}+`, `评分 ${intent.minRating}+`), () => updateIntent({ minRating: 0 }));
  if (intent.hasReviews) add(t("Has reviews", "有玩家评价"), () => updateIntent({ hasReviews: false }));
  if (intent.sortBy) add(t(`${sortNames[intent.sortBy]}: ${intent.sortDirection === "asc" ? "ascending" : "descending"}`, `${sortNames[intent.sortBy]}：${intent.sortDirection === "asc" ? "升序" : "降序"}`), () => updateIntent({ sortBy: null, sortDirection: "asc" }));
  if (intent.limit !== null || intent.offset > 0) add(intent.limit === 1 ? t(`Result ${intent.offset + 1}`, `第 ${intent.offset + 1} 项`) : t(`Results from ${intent.offset + 1}${intent.limit ? ` · ${intent.limit} max` : ""}`, `从第 ${intent.offset + 1} 项开始${intent.limit ? ` · 最多 ${intent.limit} 项` : ""}`), () => updateIntent({ limit: null, offset: 0 }));

  function exampleButton(example: string) {
    return <button
      key={example}
      className="scenario-button"
      type="button"
      title={localizeExampleQuery(example, language)}
      disabled={catalogLoading || catalog.length === 0}
      onClick={() => {
        const localized = localizeExampleQuery(example, language);
        setQuery(localized);
        void runSearch(localized);
      }}
    >
      {exampleLabels[exampleLabel(example)]}
    </button>;
  }

  return <section className="search-panel" id="game-search-panel">
    <form className="search-form" onSubmit={(event) => { event.preventDefault(); if (!displayQuery.trim()) onReturnToBrowse(); else void runSearch(displayQuery); }}>
      <div className="search-label-row">
        <label htmlFor="game-search">{isDeveloper ? t("Research the catalog", "搜索研究对象") : t("Search games", "搜索游戏")}</label>
        <p id="search-hint">{isDeveloper ? t("Find comparable games by genre, rating, or price.", "按类型、评分或价格寻找同类游戏。") : t("A title, a genre, or a budget.", "输入游戏名、类型或美元预算。")}</p>
      </div>
      <textarea
        id="game-search"
        maxLength={500}
        aria-label={isDeveloper ? t("Research the catalog", "搜索研究对象") : t("Search games", "搜索游戏")}
        aria-describedby="search-hint"
        value={displayQuery}
        placeholder={isDeveloper ? t("Try exploration games with reviews", "例如：有玩家评价的探索类游戏") : t("Try story-rich games under $25", "例如：25 美元以下的剧情游戏")}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
            || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          if (!catalogLoading && catalog.length > 0) event.currentTarget.form?.requestSubmit();
        }}
        spellCheck={false}
        rows={1}
      />
      <button className="primary-button" type="submit" disabled={catalogLoading || catalog.length === 0}>
        <Sparkles size={16} aria-hidden="true" />
        {searchLoading ? t("Searching…", "搜索中…") : isDeveloper ? t("Explore catalog", "探索游戏库") : t("Run Search", "开始搜索")}
      </button>
    </form>
    {searchError && <ErrorNotice message={searchError} onRetry={() => void runSearch(displayQuery)} />}
    <div className="search-examples">
      <span>{t("Try:", "试试：")}</span>
      {primaryExamples.flatMap((label) => exampleQueries.filter((example) => exampleLabel(example) === label)).map(exampleButton)}
      <details>
        <summary>{t("More examples", "更多示例")}</summary>
        <div className="scenario-grid">
          {exampleQueries.filter((example) => !primaryExamples.includes(exampleLabel(example))).map(exampleButton)}
        </div>
      </details>
    </div>
    <div className="search-toolbar">
      {!isBrowsing && <ul className="filter-summary" aria-label={t("Current search filters", "当前搜索条件")}>
        {intent.maxPrice === null && <li>{t("Any price", "不限价格")}</li>}
        {activeFilters.map(({ label, remove }) => <li key={label}><button type="button" onClick={remove} aria-label={t(`Remove ${label}`, `移除${label}`)}>{label}<X size={14} aria-hidden="true" /></button></li>)}
      </ul>}
      {!isBrowsing && <p className="search-condition-status" role="status">{conditionsEdited ? t("Conditions updated. Search again to replace them with your text.", "条件已更新；再次搜索会按输入内容重新设置条件。") : t("These conditions are applied. Remove one or edit Filters to adjust the results.", "以下条件已生效，可移除单项或展开筛选进行调整。")}</p>}
      <div className="search-tools">
        <details className="filter-disclosure">
          <summary><SlidersHorizontal size={16} aria-hidden="true" />{t("Filters", "筛选条件")}</summary>
          <div className="filter-fields">
            <label className="field"><span>{t("Title contains", "名称包含")}</span><input className="text-input" type="text" maxLength={500} value={intent.titleQuery ?? ""} onChange={e => updateIntent({ titleQuery: e.target.value || null })} /></label>
            <div className="filter-price">
              <label className="field">
                <span>{t("Max Price", "价格上限（美元）")}</span>
                <input
                  type="range"
                  min="0"
                  max={priceCeiling}
                  step="0.01"
                  value={intent.maxPrice ?? priceCeiling}
                  onChange={(event) => updateIntent({ maxPrice: Number(event.target.value) })}
                />
                <strong>{intent.maxPrice === null ? t("Any price", "不限价格") : money(intent.maxPrice)}</strong>
              </label>
              {intent.maxPrice !== null && <button className="ghost-button" type="button" onClick={() => updateIntent({ maxPrice: null })}>{t("Remove price limit", "移除价格限制")}</button>}
            </div>
            <label className="field">
                <span>{t("Include type", "添加必选类型")}</span>
              <select
                value=""
                onChange={(event) => { if (event.target.value) updateIntent({ tags: [...intent.tags, event.target.value], excludedTags: excluded.filter(v => v !== event.target.value) }); }}
              >
                <option value="">{t("Add a type", "选择类型")}</option>
                {tags.filter(value => !intent.tags.includes(value)).map((value) => <option key={value} value={value}>{tag(value)}</option>)}
              </select>
            </label>
            <label className="field"><span>{t("Exclude type", "添加排除类型")}</span><select value="" onChange={e => { if (e.target.value) updateIntent({ excludedTags: [...excluded, e.target.value], tags: intent.tags.filter(v => v !== e.target.value) }); }}><option value="">{t("Add a type", "选择类型")}</option>{tags.filter(value => !excluded.includes(value)).map(value => <option key={value} value={value}>{tag(value)}</option>)}</select></label>
            <label className="field"><span>{t("Minimum rating", "最低评分")}</span><select value={intent.minRating} onChange={e => updateIntent({ minRating: Number(e.target.value) })}>{[...new Set([0, 3, 4, 4.4, 4.5, 4.8, intent.minRating])].sort((a,b) => a-b).map(value => <option key={value} value={value}>{value === 0 ? t("Any rating", "不限评分") : `${value}+`}</option>)}</select></label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={intent.hasReviews}
                onChange={(event) => updateIntent({ hasReviews: event.target.checked })}
              />
              {t("Has player reviews", "有玩家评价")}
            </label>
            <div className="research-sort-fields">
              <label className="field">
                <span>{t("Sort by", "排序依据")}</span>
                <select value={intent.sortBy ?? ""} onChange={(event) => updateIntent({ sortBy: (event.target.value || null) as typeof intent.sortBy, limit: null, offset: 0 })}>
                  <option value="">{t("Catalog order", "目录顺序")}</option>
                  {Object.entries(sortNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{t("Direction", "排序方向")}</span>
                <select value={intent.sortDirection} disabled={intent.sortBy === null} onChange={(event) => updateIntent({ sortDirection: event.target.value as typeof intent.sortDirection })}>
                  <option value="desc">{t("Descending", "降序")}</option>
                  <option value="asc">{t("Ascending", "升序")}</option>
                </select>
              </label>
            </div>
            <label className="field"><span>{t("Maximum results", "最多显示数量")}</span><select value={intent.limit ?? ""} onChange={e => updateIntent({ limit: e.target.value ? Number(e.target.value) : null })}><option value="">{t("All results", "全部结果")}</option>{Array.from({ length: 50 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
            <label className="field"><span>{t("Start at result", "从第几项开始")}</span><select value={intent.offset + 1} onChange={e => updateIntent({ offset: Number(e.target.value) - 1 })}>{Array.from({ length: 101 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
          </div>
          <button className="small-button" type="button" onClick={clearFilters}>{t("Clear conditions", "清空条件")}</button>
        </details>

      </div>
    </div>
  </section>;
}
