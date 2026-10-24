import type { Game } from "../types";
import { useI18n } from "../i18n";

export function GameProvenance({ game }: { game: Game }) {
  const { t } = useI18n();
  const source = game.contentSource;
  const validUrl = source?.url?.startsWith("https://") ? source.url : null;
  return <details className="game-provenance">
    <summary>{t("Sources and recommendation basis", "资料来源与建议依据")}</summary>
    {source && validUrl ? <p><a href={validUrl} target="_blank" rel="noreferrer">{t("Gameplay source", "玩法资料来源")}</a> · {t("Checked", "核对日期")} {source.checkedOn}<br />{t("Scope: gameplay summary and editorial tags only.", "适用范围：仅玩法摘要和编辑整理的标签。")}</p>
      : <p>{t("Gameplay source and check date are unavailable.", "暂无玩法资料来源与核对日期。")}</p>}
    <p>{game.metricsKind === "demo"
      ? t("Price, rating, review count, ownership and revenue are synthetic demonstration values, not store prices or verified market data.", "价格、评分、评价数、拥有量和营收均为合成演示值，不代表商店现价或经核实的市场数据。")
      : t("The source and verification date of these metrics are unknown.", "这些指标的来源与核对日期未知。")}</p>
    <p>{t("Suggestions use catalog tags and your saved preferences. General ranking also uses catalog metrics. No review text was analyzed; these signals do not establish player sentiment or market demand.", "建议依据目录标签与已保存的偏好；通用排序也使用目录指标。未分析评论原文，不能据此判断玩家口碑或市场需求。")}</p>
  </details>;
}
