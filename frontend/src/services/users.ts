import type { AuthSession, UserProfile, UserRole } from "../types";
import { ApiError, requestApi } from "./http";
import { API_BASE_URL, DATA_MODE } from "./runtime";

const AUTH_TOKEN_STORAGE_KEY = `game-discovery-lens.api.${encodeURIComponent(API_BASE_URL)}.authToken`;
const LEGACY_AUTH_TOKEN_STORAGE_KEY = `arcadeiq.api.${encodeURIComponent(API_BASE_URL)}.authToken`;
export const AUTH_SESSION_STORAGE_KEY = `${AUTH_TOKEN_STORAGE_KEY}.session`;
export const SESSION_CHANGED = "gdl-session-changed";
export const SESSION_EXPIRED = "gdl-session-expired";
export interface VerifiedSession { user: UserProfile; token: string; version: string }
let verified: VerifiedSession | null = null;

export function storedSessionVersion(): string | null {
  const token = getStoredAuthToken();
  if (!token) return null;
  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (raw) {
    const session = JSON.parse(raw) as { token: string; version: string };
    if (session.token === token) return session.version;
  }
  return token; // Existing installations are verified before legacy credentials can be used.
}
export function verifySession(user: UserProfile, token: string, version: string | null) {
  if (!version || getStoredAuthToken() !== token || storedSessionVersion() !== version) return false;
  verified = { user, token, version };
  return true;
}
export const getVerifiedSession = () => verified;
export const invalidateSession = () => { verified = null; };
export function isCurrentSession(session: VerifiedSession | null) {
  if (DATA_MODE !== "api") return true;
  return !!session && verified === session && getStoredAuthToken() === session.token && storedSessionVersion() === session.version;
}
export function checkSession(session: VerifiedSession | null) {
  if (isCurrentSession(session)) return true;
  window.dispatchEvent(new Event(SESSION_CHANGED));
  return false;
}

export async function requestAccount<T>(path: string, userId: string, init: RequestInit = {}): Promise<T> {
  const session = verified;
  if (!session && !getStoredAuthToken()) throw new ApiError(401, "Sign in to access your account.");
  if (!checkSession(session) || session?.user.id !== userId) {
    throw new ApiError(409, "Your account changed. Check the current account before trying again.");
  }
  try {
    const result = await requestApi<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.token}` } });
    if (!checkSession(session)) throw new ApiError(409, "Your account changed. Check the current account before trying again.");
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && isCurrentSession(session)) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED, { detail: session }));
    }
    throw error;
  }
}

export async function getUsers(): Promise<UserProfile[]> {
  if (DATA_MODE === "demo") return [];
  return requestAccount<UserProfile[]>("/users", verified?.user.id ?? "");
}

export async function loginUser(userId: string, password: string): Promise<AuthSession> {
  requireApiMode();
  return requestApi<AuthSession>("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ userId, password }),
  });
}

export async function registerUser(email: string, displayName: string, password: string): Promise<AuthSession> {
  requireApiMode();
  return requestApi<AuthSession>("/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, displayName, password }),
  });
}

export async function getAuthenticatedUser(token: string): Promise<UserProfile> {
  requireApiMode();
  if (!token) throw new ApiError(401, "Sign in to access your account.");
  return requestApi<UserProfile>("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getStoredAuthToken(): string | null {
  if (DATA_MODE !== "api") return null;
  const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (raw !== null) {
    const session = JSON.parse(raw) as { token?: unknown; version?: unknown };
    if (typeof session.token !== "string" || typeof session.version !== "string") throw new Error("Saved sign-in is unreadable. Sign out and sign in again.");
    return session.token;
  }
  const currentToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (currentToken !== null) return currentToken;
  const legacyToken = window.localStorage.getItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
  if (legacyToken !== null) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyToken);
  return legacyToken;
}

export function setStoredAuthToken(token: string) {
  if (DATA_MODE !== "api") return;
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ token, version: crypto.randomUUID() }));
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
}

export function clearStoredAuthToken() {
  if (DATA_MODE !== "api") return;
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function requireApiMode() {
  if (DATA_MODE !== "api") {
    throw new ApiError(400, "Account sign-in is available in API mode. Demo mode uses local samples.");
  }
}

export function formatRoleLabel(role: UserRole) {
  if (role === "admin") return "Admin";
  if (role === "developer") return "Developer";
  if (role === "player") return "Player";
  return "Guest";
}
