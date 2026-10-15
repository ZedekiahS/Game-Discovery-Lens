const chineseErrors: Record<string, string> = {
  "Your game records could not be loaded.": "游戏记录加载失败，请检查网络或浏览器存储后重试。",
  "Your changes could not be confirmed. Reload your library before trying again.": "无法确认更改是否已保存，请重新加载游戏库后再试。",
  "Your preferences could not be saved. Choose up to 12 tags per group without overlap.": "偏好保存失败，每组最多选择 12 个类型，且不能重复。",
  "Cannot reach the API. Check the connection and try again.": "无法连接 API，请检查网络后重试。",
  "Unable to load the catalog.": "无法加载游戏目录。",
  "Unable to run search.": "搜索失败，请重试。",
  "Unable to load game details.": "无法加载游戏详情。",
  "Unable to load game intelligence.": "无法加载游戏洞察。",
  "This game is unavailable.": "这款游戏暂不可用。",
  "Unable to load collections.": "无法加载收藏夹。",
  "Unable to load collection intelligence.": "无法加载收藏洞察。",
  "Check your connection.": "请检查网络连接。",
  "Sign in to access your account.": "请登录以访问账号。",
  "Sign in to access your collections.": "请登录以访问收藏夹。",
  "Account sign-in is available in API mode. Demo mode uses local samples.": "请在 API 模式登录；演示模式使用本地示例。",
  "Your session has expired. Sign in again or sign out.": "登录已过期，请重新登录或退出。",
  "Your session has expired. Unable to clear the saved sign-in; check browser storage and retry sign out.": "登录已过期，且无法清除保存的登录信息。请检查浏览器存储后重试退出。",
  "Unable to check your account. Your sign-in is retained; retry when connected.": "无法验证账号，已保留登录信息，请恢复连接后重试。",
  "Sign-in failed. Please retry.": "登录失败，请重试。",
  "Unable to clear the saved sign-in. Check browser storage and retry sign out.": "无法清除保存的登录信息，请检查浏览器存储后重试退出。",
  "Saved demo collections are not a valid list.": "本地演示收藏夹数据格式无效。",
  "Saved demo games are not a valid collection map.": "本地演示收藏数据格式无效。",
  "Collection not found": "找不到该收藏夹。",
  "Default collection cannot be renamed": "默认收藏夹不能重命名。",
  "Default collection cannot be deleted": "默认收藏夹不能删除。",
  "Collection name is required": "请填写收藏夹名称。",
  "Collection name already exists": "收藏夹名称已存在。",
  "Invalid user id or password": "用户 ID 或密码不正确。",
  "Display name is required": "请填写显示名称。",
  "Email is invalid": "邮箱格式不正确。",
  "Password must be at least 8 characters": "密码至少需要 8 个字符。",
  "Email is already registered": "该邮箱已被注册。",
  "Invalid or expired token": "登录信息无效或已过期，请重新登录。",
  "User is not active": "该账号未启用。",
  "Missing authorization header": "缺少登录信息，请重新登录。",
  "Expected bearer token": "登录信息格式不正确，请重新登录。",
  "Game not found": "找不到该游戏。",
  "Saved game was not persisted": "收藏未能保存，请重新加载后确认。",
  "User not found": "找不到该用户。",
  "Admin access is required": "此操作需要管理员权限。",
  "User profile is private": "该用户资料不公开。",
};

export function translateError(message: string, language: "en" | "zh"): string {
  if (language === "en" || !message) return message;
  if (chineseErrors[message]) return chineseErrors[message];
  const mutation = /^The change could not be confirmed\. ([\s\S]+) Reload collections before retrying\.$/.exec(message);
  if (mutation) return `无法确认更改是否成功。${translateError(mutation[1], language)} 重试前请先重新加载收藏夹。`;
  const api = /^API request failed \((\d+)\)\.$/.exec(message);
  if (api) return `API 请求失败（${api[1]}）。`;
  // Unknown provider/browser errors remain available verbatim; do not invent a diagnosis.
  return /[\u3400-\u9fff]/.test(message) ? message : `原始错误：${message}`;
}
