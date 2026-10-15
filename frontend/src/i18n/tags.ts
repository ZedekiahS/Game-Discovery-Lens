const chineseTags: Record<string, string> = {
  Racing: "竞速", Rhythm: "节奏音乐", VR: "虚拟现实", "First-Person": "第一人称视角",
  Building: "自由建造", Horror: "恐怖", "Auto Battler": "自动战斗", "Tower Defense": "塔防",
  "Turn-Based": "回合制", "Real-Time Strategy": "即时战略", "Visual Novel": "视觉小说", Physics: "物理互动",
  Action: "动作", Adventure: "冒险", Atmospheric: "氛围感", "Card Battler": "卡牌对战",
  "Co-op": "合作", Cozy: "休闲治愈", Crafting: "制作建造", Detective: "侦探",
  Difficult: "高难度", Exploration: "探索", FPS: "第一人称射击", Farming: "农场",
  Fishing: "钓鱼", Management: "经营管理", Metroidvania: "类银河战士恶魔城",
  Multiplayer: "多人", "Open World": "开放世界", Platformer: "平台跳跃", Puzzle: "解谜",
  RPG: "角色扮演", Roguelike: "肉鸽", Shooter: "射击", Simulation: "模拟",
  Singleplayer: "单人", Space: "太空", "Story Rich": "剧情丰富", Strategy: "策略",
  Survival: "生存", "Survival Horror": "生存恐怖", Training: "训练",
};

// Tags are translated for display only; filters and API payloads keep canonical values.
export function translateTag(tag: string, language: "en" | "zh") {
  return language === "zh" ? chineseTags[tag] ?? tag : tag;
}
