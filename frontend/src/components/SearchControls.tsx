import { SlidersHorizontal, Sparkles } from "lucide-react";
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
    searchError, searchLoading, runSearch, updateIntent, isBrowsing } = discovery;
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
  const activeFilters = [
    ...(intent.titleQuery ? [t(`Title: ${intent.titleQuery}`, `名称：${intent.titleQuery}`)] : []),
    intent.maxPrice === null ? t("Any price", "不限价格") : intent.maxPrice === 0 ? t("Free only", "仅免费") : t(`Up to ${money(intent.maxPrice)}`, `不超过 ${money(intent.maxPrice)}`),
    ...intent.tags.map(tag),
    ...(intent.minRating > 0 ? [t(`Rated ${intent.minRating}+`, `评分 ${intent.minRating}+`)] : []),
    ...(intent.hasReviews ? [t("Has reviews", "有玩家评价")] : []),
    ...(intent.sortBy ? [t(`${sortNames[intent.sortBy]}: ${intent.sortDirection === "asc" ? "ascending" : "descending"}`, `${sortNames[intent.sortBy]}：${intent.sortDirection === "asc" ? "升序" : "降序"}`)] : []),
    ...(intent.limit !== null ? [intent.limit === 1 ? t(`Result ${intent.offset + 1}`, `第 ${intent.offset + 1} 项`) : t(`Results ${intent.offset + 1}–${intent.offset + intent.limit}`, `第 ${intent.offset + 1}–${intent.offset + intent.limit} 项`)] : intent.offset > 0 ? [t(`From result ${intent.offset + 1}`, `从第 ${intent.offset + 1} 项开始`)] : []),
  ];

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
        aria-label={isDeveloper ? t("Research the catalog", "搜索研究对象") : t("Search games", "搜索游戏")}
        aria-describedby="search-hint"
        value={displayQuery}
        placeholder={isDeveloper ? t("Try exploration games with reviews", "例如：有玩家评价的探索类游戏") : t("Try story-rich games under $25", "例如：25 美元以下的剧情游戏")}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
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
        {activeFilters.map((filter) => <li key={filter}>{filter}</li>)}
      </ul>}
      <div className="search-tools">
        <details className="filter-disclosure">
          <summary><SlidersHorizontal size={16} aria-hidden="true" />{t("Filters", "筛选条件")}</summary>
          <div className="filter-fields">
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
              <span>{t("Tag Focus", "游戏类型")}</span>
              <select
                value={intent.tags[0] ?? ""}
                onChange={(event) => updateIntent({ tags: event.target.value ? [event.target.value] : [] })}
              >
                <option value="">{t("Any tag", "不限类型")}</option>
                {tags.map((value) => <option key={value} value={value}>{tag(value)}</option>)}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={intent.hasReviews}
                onChange={(event) => updateIntent({ hasReviews: event.target.checked })}
              />
              {t("Has player reviews", "有玩家评价")}
            </label>
            {isDeveloper && <div className="research-sort-fields">
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
            </div>}
          </div>
        </details>

      </div>
    </div>
  </section>;
}
