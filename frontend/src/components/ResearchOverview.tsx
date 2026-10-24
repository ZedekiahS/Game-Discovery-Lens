import { ArrowUpRight, Building2, CircleDollarSign, Library, Star } from "lucide-react";
import { useMemo } from "react";
import type { Game } from "../types";
import { useI18n } from "../i18n";
import { summarizeCatalog } from "../lib/researchOverview";
import "./research-overview.css";

export function ResearchOverview({ catalog, onResearchTag }: { catalog: Game[]; onResearchTag: (tag: string) => void }) {
  const { t, tag } = useI18n();
  const summary = useMemo(() => summarizeCatalog(catalog), [catalog]);
  return <section className="research-overview" aria-label={t("Catalog overview", "目录概况")}>
    <div className="section-heading">
      <h2><Library size={18} aria-hidden="true" />{t("Catalog at a glance", "游戏目录一览")}</h2>
      <span className="overview-source">{catalog.length > 0 && catalog.every(game => game.metricsKind === "demo") ? t("Sample catalog", "示例目录") : t("Unverified metrics", "指标未核实")}</span>
    </div>
    <p className="overview-scope">{catalog.length > 0 && catalog.every(game => game.metricsKind === "demo") ? t("Synthetic prices and ratings for comparison, not verified market data.", "价格与评分为合成演示值，可用于比较，不代表真实市场数据。") : t("A snapshot of the loaded catalog to help frame your research.", "从当前加载的游戏目录出发，确定你的研究方向。")}</p>
    <dl className="overview-metrics">
      <div><dt><Library size={15} aria-hidden="true" />{t("Games in catalog", "目录游戏数")}</dt><dd>{summary.gameCount}</dd></div>
      <div><dt><Building2 size={15} aria-hidden="true" />{t("Developers", "开发商数")}</dt><dd>{summary.developerCount}</dd></div>
      <div><dt><CircleDollarSign size={15} aria-hidden="true" />{t("Average price · USD", "平均价格 · 美元")}</dt><dd>{summary.averagePrice === null ? "—" : `US$${summary.averagePrice.toFixed(2)}`}</dd></div>
      <div><dt><Star size={15} aria-hidden="true" />{t("Average rating", "平均评分")}</dt><dd>{summary.averageRating === null ? "—" : <>{summary.averageRating.toFixed(1)}<small> / 5</small></>}</dd></div>
    </dl>
    {summary.topTags.length > 0 && <div className="overview-tags">
      <div className="overview-tag-heading"><h3>{t("Explore a genre", "从类型开始研究")}</h3><p>{t("Most common tags · A game can have multiple tags.", "目录中常见的标签 · 一款游戏可有多个标签。")}</p></div>
      <div className="overview-tag-grid">
        {summary.topTags.map(({ tag: gameTag, count }) => <button type="button" key={gameTag} className="overview-tag-button" aria-label={t(`Research ${gameTag}`, `研究${tag(gameTag)}`)} onClick={() => onResearchTag(gameTag)}>
          <span className="overview-tag-label">{tag(gameTag)}<ArrowUpRight size={14} aria-hidden="true" /></span>
          <span className="overview-tag-count">{t(`${count} games`, `${count} 款游戏`)}</span>
          <span className="overview-tag-track" aria-hidden="true"><span style={{ width: `${count / summary.gameCount * 100}%` }} /></span>
        </button>)}
      </div>
    </div>}
  </section>;
}
