import { useEffect, useRef, useState } from "react";
import type { AuthSession, UserProfile } from "../types";
import { DATA_MODE } from "../services/runtime";
import { ApiError } from "../services/http";
import {
  clearStoredAuthToken, getAuthenticatedUser, getStoredAuthToken,
  loginUser, registerUser, setStoredAuthToken,
  storedSessionVersion, verifySession, invalidateSession, getVerifiedSession, isCurrentSession,
  SESSION_CHANGED, SESSION_EXPIRED,
} from "../services/users";

type AccountStatus = "anonymous" | "checking" | "authenticated" | "error" | "expired";
interface AccountState {
  status: AccountStatus;
  user: UserProfile | null;
  error: string;
  revision: number;
}

export function useAccount() {
  const sequence = useRef(0);
  const authentication = useRef<number | null>(null);
  const [state, setState] = useState<AccountState>({
    status: DATA_MODE === "api" ? "checking" : "anonymous",
    user: null, error: "", revision: 0,
  });

  async function retry() {
    const revision = ++sequence.current;
    authentication.current = null;
    invalidateSession();
    setState({ status: "checking", user: null, error: "", revision });
    let token: string | null = null;
    let version: string | null = null;
    try {
      token = DATA_MODE === "api" ? getStoredAuthToken() : null;
      version = storedSessionVersion();
      if (!token) {
        setState({ status: "anonymous", user: null, error: "", revision });
        return;
      }
      const user = await getAuthenticatedUser(token);
      if (sequence.current === revision) {
        if (!verifySession(user, token, version)) { void retry(); return; }
        setState({ status: "authenticated", user, error: "", revision });
      }
    } catch (error) {
      if (sequence.current !== revision) return;
      try {
        if (getStoredAuthToken() !== token || storedSessionVersion() !== version) { void retry(); return; }
      } catch { /* Report inaccessible storage without removing another session. */ }
      const expired = error instanceof ApiError && (error.status === 401 || error.status === 403);
      let expiredMessage = "Your session has expired. Sign in again or sign out.";
      if (expired) {
        try {
          clearStoredAuthToken();
        } catch {
          expiredMessage = "Your session has expired. Unable to clear the saved sign-in; check browser storage and retry sign out.";
        }
      }
      // Connectivity failures must not sign the user out or switch persistence modes.
      setState({
        status: expired ? "expired" : "error", user: null, revision,
        error: expired ? expiredMessage
          : "Unable to check your account. Your sign-in is retained; retry when connected.",
      });
    }
  }

  useEffect(() => {
    void retry();
    const changed = () => { void retry(); };
    const synchronize = () => {
      if (DATA_MODE !== "api") return;
      const current = getVerifiedSession();
      if (current && !isCurrentSession(current)) void retry();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key.includes(".authToken")) void retry();
    };
    const expired = () => {
      const revision = ++sequence.current;
      authentication.current = null;
      invalidateSession();
      try { clearStoredAuthToken(); } catch { /* Recovery stays available if storage is blocked. */ }
      setState({ status: "expired", user: null, revision, error: "Your session has expired. Sign in again to continue. Unsaved drafts stay with their original account in this tab." });
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", synchronize);
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => {
      ++sequence.current; authentication.current = null; invalidateSession();
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", synchronize);
      window.removeEventListener(SESSION_CHANGED, changed);
      window.removeEventListener(SESSION_EXPIRED, expired);
    };
  }, []);

  async function authenticate(request: () => Promise<AuthSession>): Promise<boolean> {
    if (authentication.current !== null) return false;
    const revision = ++sequence.current;
    authentication.current = revision;
    invalidateSession();
    setState({ status: "checking", user: null, error: "", revision });
    let startingVersion: string | null = null;
    try {
      startingVersion = storedSessionVersion();
      const session = await request();
      if (sequence.current !== revision) return false;
      if (storedSessionVersion() !== startingVersion) { void retry(); return false; }
      // Commit credentials only while this login is still the current operation.
      setStoredAuthToken(session.accessToken);
      if (!verifySession(session.user, session.accessToken, storedSessionVersion())) { void retry(); return false; }
      setState({ status: "authenticated", user: session.user, error: "", revision });
      return true;
    } catch (error) {
      if (sequence.current !== revision) return false;
      try {
        if (storedSessionVersion() !== startingVersion) { void retry(); return false; }
      } catch { /* Preserve storage errors for the existing sign-in recovery path. */ }
      setState({
        status: "anonymous", user: null, revision,
        error: error instanceof Error ? error.message : "Sign-in failed. Please retry.",
      });
      return false;
    } finally {
      if (authentication.current === revision) authentication.current = null;
    }
  }

  function logout() {
    const current = getVerifiedSession();
    if (current && !isCurrentSession(current)) { void retry(); return; }
    const revision = ++sequence.current;
    authentication.current = null;
    invalidateSession();
    try {
      clearStoredAuthToken();
      setState({ status: "anonymous", user: null, error: "", revision });
    } catch {
      setState({
        status: "error", user: null, revision,
        error: "Unable to clear the saved sign-in. Check browser storage and retry sign out.",
      });
    }
  }

  return {
    ...state, retry, logout,
    login: (identifier: string, password: string) => authenticate(() => loginUser(identifier, password)),
    register: (email: string, displayName: string, password: string) =>
      authenticate(() => registerUser(email, displayName, password)),
  };
}
