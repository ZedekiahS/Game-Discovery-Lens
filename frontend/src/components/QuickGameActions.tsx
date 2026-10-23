import { Heart, ListPlus, ThumbsDown } from "lucide-react";
import { useRef, useState } from "react";
import type { usePlayerLibrary } from "../hooks/usePlayerLibrary";
import type { PlayerGameUpdate } from "../types";
import { useI18n } from "../i18n";
import { ErrorNotice } from "./ui";

export function QuickGameActions({ gameId, library, onAction }: {
  gameId: number;
  library: ReturnType<typeof usePlayerLibrary>;
  onAction: () => void;
}) {
  const { t } = useI18n();
  const record = library.records.find((r) => r.gameId === gameId);
  const [feedback, setFeedback] = useState<"saving" | "saved" | null>(null);
  const locked = useRef(false);
  const disabled = library.loading || !library.loaded || library.busy || !!library.error;
  async function update(change: PlayerGameUpdate) {
    if (locked.current || disabled) return;
    locked.current = true;
    onAction();
    setFeedback("saving");
    try { setFeedback(await library.updateRecord(gameId, change) ? "saved" : null); }
    finally { locked.current = false; }
  }
  return <div className="quick-game-actions">
    <div className="quick-game-buttons" role="group" aria-label={t("Your preference for this game", "你对这款游戏的偏好")}>
      <button type="button" className="small-button" aria-pressed={record?.affinity === "like"} disabled={disabled}
        onClick={() => void update({ affinity: record?.affinity === "like" ? "neutral" : "like" })}>
        <Heart size={16} aria-hidden="true" />{t("Like", "喜欢")}
      </button>
      <button type="button" className="small-button" aria-pressed={record?.status === "want_to_play"} disabled={disabled}
        onClick={() => void update({ status: record?.status === "want_to_play" ? null : "want_to_play" })}>
        <ListPlus size={16} aria-hidden="true" />{t("Want to play", "想玩")}
      </button>
      <button type="button" className="ghost-button" aria-pressed={record?.affinity === "dislike"} disabled={disabled}
        onClick={() => void update({ affinity: record?.affinity === "dislike" ? "neutral" : "dislike" })}>
        <ThumbsDown size={15} aria-hidden="true" />{t("Not for me", "不合口味")}
      </button>
    </div>
    <p className="quick-game-feedback" role="status" aria-atomic="true">{feedback === "saving" ? t("Saving preference…", "正在保存偏好…")
      : feedback === "saved" ? t("Preference saved", "偏好已保存") : ""}</p>
    {library.error && <ErrorNotice message={library.error} onRetry={library.retry} disabled={library.busy || library.loading} />}
  </div>;
}
