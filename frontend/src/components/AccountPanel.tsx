import { KeyRound, LogOut, RefreshCcw, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { useAccount } from "../hooks/useAccount";
import { confirmPageExit } from "../hooks/usePage";
import { useI18n } from "../i18n";
import { formatRoleLabel } from "../services/users";

type AuthField = "identifier" | "email" | "displayName" | "password";

export function AccountPanel({ account, loginRequest = 0, onCancelSignIn, compact = false }: {
  account: ReturnType<typeof useAccount>;
  loginRequest?: number;
  onCancelSignIn?: () => void;
  compact?: boolean;
}) {
  const { t, error } = useI18n();
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [touched, setTouched] = useState<Partial<Record<AuthField, boolean>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const isLoggingIn = account.status === "checking";
  const validation = {
    identifier: loginIdentifier.length > 255 ? t("Use at most 255 characters.", "最多 255 个字符。") : loginIdentifier.trim() ? "" : t("Enter your user ID or email.", "请输入用户 ID 或邮箱。"),
    email: registerEmail.length > 255 ? t("Use at most 255 characters.", "最多 255 个字符。") : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registerEmail.trim()) ? "" : t("Enter a valid email address.", "请输入有效的邮箱地址。"),
    displayName: registerDisplayName.length > 120 ? t("Use at most 120 characters.", "最多 120 个字符。") : registerDisplayName.trim() ? "" : t("Enter a display name.", "请输入昵称。"),
    password: accountPassword.length > 128 ? t("Use at most 128 characters.", "最多 128 个字符。") : authMode === "register"
      ? Array.from(accountPassword).length >= 8 ? "" : t("Use at least 8 characters.", "密码至少需要 8 个字符。")
      : accountPassword ? "" : t("Enter your password.", "请输入密码。"),
  };

  useEffect(() => {
    if (loginRequest > 0) openLoginForm();
  }, [loginRequest]);
  useEffect(() => {
    const input = formRef.current?.querySelector<HTMLInputElement>("input");
    input?.focus();
    input?.scrollIntoView?.({ block: "nearest" });
  }, [authMode, loginRequest]);

  function resetAuthForm() {
    setAuthMode(null);
    setLoginIdentifier("");
    setAccountPassword("");
    setRegisterEmail("");
    setRegisterDisplayName("");
    setTouched({});
  }
  function openLoginForm() { resetAuthForm(); setAuthMode("login"); }
  function openRegisterForm() { resetAuthForm(); setAuthMode("register"); }
  function validate(fields: AuthField[]) {
    setTouched(Object.fromEntries(fields.map((field) => [field, true])));
    const invalid = fields.find((field) => validation[field]);
    if (invalid) formRef.current?.querySelector<HTMLInputElement>(`[name="${invalid}"]`)?.focus();
    return !invalid;
  }
  function fieldProps(field: AuthField) {
    return {
      name: field,
      required: true,
      maxLength: field === "displayName" ? 120 : field === "password" ? 128 : 255,
      "aria-invalid": !!(touched[field] && validation[field]),
      "aria-describedby": [
        touched[field] && validation[field] ? `${fieldId}-${field}-error` : "",
        field === "password" && authMode === "register" ? `${fieldId}-password-hint` : "",
      ].filter(Boolean).join(" ") || undefined,
      onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    };
  }
  function fieldError(field: AuthField) {
    return touched[field] && validation[field]
      ? <small className="field-error" id={`${fieldId}-${field}-error`}>{validation[field]}</small> : null;
  }
  async function loginAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate(["identifier", "password"])) return;
    if (await account.login(loginIdentifier.trim(), accountPassword)) resetAuthForm();
  }
  async function registerAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate(["email", "displayName", "password"])) return;
    if (await account.register(registerEmail.trim(), registerDisplayName.trim(), accountPassword)) resetAuthForm();
  }
  function logoutAccount() {
    if (!confirmPageExit()) return;
    account.logout(); resetAuthForm(); onCancelSignIn?.();
  }

  if (compact && account.user && account.status === "authenticated" && !account.error) return (
    <section className="account-inline" aria-label={t("Account", "账号")}>
      <UserRound size={16} aria-hidden="true" /><span className="session-id">{account.user.displayName}</span>
      <button className="ghost-button" type="button" onClick={logoutAccount}><LogOut size={13} aria-hidden="true" />{t("Sign Out", "退出登录")}</button>
    </section>
  );

  return (
    <section className="tool-panel session-panel">
      <div className="section-heading">
        <h2><UserRound size={16} aria-hidden="true" />{t("Account", "账号")}</h2>
        <span>{account.user ? t("Signed in", "已登录") : t("Sign-in required to save", "登录后即可收藏")}</span>
      </div>
      {account.user && (
        <div className="session-meta">
          <p className="session-id">{account.user.displayName}</p>
          <span className={`role-pill ${account.user.role}`}><ShieldCheck size={12} aria-hidden="true" />{t(formatRoleLabel(account.user.role), { admin: "管理员", developer: "开发者", player: "玩家", guest: "访客" }[account.user.role])}</span>
        </div>
      )}
      {account.status === "checking" && <p role="status" className="mode-description">{t("Checking account…", "正在验证账号…")}</p>}
      {account.error && <div className="form-error" role="alert">{error(account.error)}</div>}
      {account.status === "error" && <button className="small-button" type="button" onClick={() => void account.retry()}><RefreshCcw size={13} aria-hidden="true" />{t("Retry account", "重新验证账号")}</button>}
      {!account.user && authMode === null && (
        <div className="account-actions">
          <button className="small-button" type="button" onClick={openLoginForm} disabled={isLoggingIn}><KeyRound size={13} aria-hidden="true" />{t("Sign In", "登录")}</button>
          <button className="ghost-button" type="button" onClick={openRegisterForm} disabled={isLoggingIn}>{t("Create Account", "注册账号")}</button>
        </div>
      )}
      {authMode !== null && !account.user && (
        <form ref={formRef} className="account-form" noValidate aria-busy={isLoggingIn} onSubmit={(event) => void (authMode === "login" ? loginAccount(event) : registerAccount(event))}>
          {authMode === "login" ? (
            <label className="field compact"><span>{t("User ID or Email", "用户 ID 或邮箱")}</span>
              <input {...fieldProps("identifier")} className="text-input" type="text" autoComplete="username" value={loginIdentifier} onChange={(event) => setLoginIdentifier(event.target.value)} placeholder="player@example.com" aria-label={t("User ID or email", "用户 ID 或邮箱")} disabled={isLoggingIn} />
              {fieldError("identifier")}
            </label>
          ) : (
            <>
              <label className="field compact"><span>{t("Email", "邮箱")}</span>
                <input {...fieldProps("email")} className="text-input" type="email" autoComplete="email" value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} placeholder="player@example.com" aria-label={t("Register email", "注册邮箱")} disabled={isLoggingIn} />
                {fieldError("email")}
              </label>
              <label className="field compact"><span>{t("Display Name", "昵称")}</span>
                <input {...fieldProps("displayName")} className="text-input" type="text" autoComplete="nickname" value={registerDisplayName} onChange={(event) => setRegisterDisplayName(event.target.value)} placeholder={t("Player name", "玩家昵称")} aria-label={t("Register display name", "注册昵称")} disabled={isLoggingIn} />
                {fieldError("displayName")}
              </label>
            </>
          )}
          <label className="field compact"><span>{t("Password", "密码")}</span>
            <input {...fieldProps("password")} className="text-input" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} placeholder={t("Password", "密码")} aria-label={authMode === "login" ? t("Account password", "账号密码") : t("Register password", "注册密码")} disabled={isLoggingIn} />
            {authMode === "register" && <small className="field-hint" id={`${fieldId}-password-hint`}>{t("At least 8 characters.", "至少 8 个字符。")}</small>}
            {fieldError("password")}
          </label>
          <div className="account-form-actions">
            <button className="small-button" type="submit" disabled={isLoggingIn}>
              <KeyRound size={13} aria-hidden="true" />{isLoggingIn ? t("Please wait", "请稍候") : authMode === "login" ? t("Sign In", "登录") : t("Create", "创建")}
            </button>
            <button className="ghost-button" type="button" onClick={() => { resetAuthForm(); onCancelSignIn?.(); }} disabled={isLoggingIn}>{t("Cancel", "取消")}</button>
          </div>
          <button className="ghost-button" type="button" onClick={authMode === "login" ? openRegisterForm : openLoginForm} disabled={isLoggingIn}>
            {authMode === "login" ? t("Create Account", "注册账号") : t("Already have an account? Sign in", "已有账号？登录")}
          </button>
        </form>
      )}
      {(account.user || account.status === "checking" || account.status === "error" || account.status === "expired") && (
        <button className="ghost-button session-logout" type="button" onClick={logoutAccount}><LogOut size={13} aria-hidden="true" />{account.status === "checking" ? t("Cancel and sign out", "取消并退出登录") : t("Sign Out", "退出登录")}</button>
      )}
    </section>
  );
}
