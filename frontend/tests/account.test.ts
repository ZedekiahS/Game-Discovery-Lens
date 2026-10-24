import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "../src/hooks/useAccount";
import { ApiError } from "../src/services/http";
import * as users from "../src/services/users";
import type { AuthSession, UserProfile } from "../src/types";
import { playerLibrary } from "../src/services/playerLibrary";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "api", API_BASE_URL: "http://localhost:8000/api" }));
vi.mock("../src/services/users", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/users")>(),
  getAuthenticatedUser: vi.fn(),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

const profile: UserProfile = {
  id: "account-a", email: "a@example.test", displayName: "Account A", role: "player",
  isActive: true, createdAt: "2026-01-01T00:00:00Z",
};
const session: AuthSession = { accessToken: "token-a", tokenType: "bearer", expiresIn: 3600, user: profile };

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("account restoration and request ownership", () => {
  it("invalidates the visible account on cross-tab storage changes", async () => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockResolvedValueOnce(profile).mockResolvedValueOnce({ ...profile, id: "account-b" });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.user?.id).toBe(profile.id));
    act(() => {
      users.setStoredAuthToken("token-b");
      window.dispatchEvent(new StorageEvent("storage", { key: users.AUTH_SESSION_STORAGE_KEY }));
    });
    expect(result.current.user).toBeNull();
    await waitFor(() => expect(result.current.user?.id).toBe("account-b"));
  });

  it("discards a delayed private response after a same-token new session version", async () => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockResolvedValue(profile);
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const response = deferred<Response>();
    vi.spyOn(globalThis, "fetch").mockReturnValue(response.promise);
    const write = playerLibrary.updateRecord(profile.id, 1, { affinity: "like" });
    users.setStoredAuthToken(session.accessToken);
    await act(async () => {
      response.resolve(new Response('{"gameId":1,"affinity":"like"}'));
      await expect(write).rejects.toMatchObject({ status: 409 });
    });
  });

  it.each([0, 503, 401])("handles a private request failure %i without replaying the write", async status => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockResolvedValue(profile);
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const request = vi.spyOn(globalThis, "fetch");
    if (status === 0) request.mockRejectedValue(new TypeError("Offline"));
    else request.mockResolvedValue(new Response('{"detail":"Rejected"}', { status }));
    await act(async () => { await expect(playerLibrary.saveRecord(profile.id, 1, { status: null, affinity: "like", notes: "Draft" })).rejects.toMatchObject({ status }); });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(status === 401 ? "expired" : "authenticated");
    expect(users.getStoredAuthToken()).toBe(status === 401 ? null : session.accessToken);
  });

  it("blocks a stale account write even before a storage event is delivered", async () => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockResolvedValue(profile);
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    users.setStoredAuthToken("token-b");
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{}'));
    await act(async () => {
      await expect(playerLibrary.updateRecord(profile.id, 1, { affinity: "like" })).rejects.toThrow();
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("restores the account from its saved token after a page reload", async () => {
    users.setStoredAuthToken(session.accessToken);
    const request = deferred<UserProfile>();
    vi.mocked(users.getAuthenticatedUser).mockReturnValue(request.promise);
    const { result } = renderHook(() => useAccount());

    expect(result.current.status).toBe("checking");
    expect(result.current.user).toBeNull();
    await act(async () => request.resolve(profile));

    expect(users.getAuthenticatedUser).toHaveBeenCalledWith(session.accessToken);
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user).toEqual(profile);
    expect(users.getStoredAuthToken()).toBe(session.accessToken);
  });

  it("keeps credentials on a temporary auth/me failure and lets retry recover", async () => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser)
      .mockRejectedValueOnce(new ApiError(0, "Connection unavailable"))
      .mockResolvedValueOnce(profile);
    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).not.toBe("");
    expect(result.current.user).toBeNull();
    expect(users.getStoredAuthToken()).toBe(session.accessToken);

    await act(async () => result.current.retry());
    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.id).toBe(profile.id);
  });

  it.each([401, 403])("clears invalid credentials when auth/me returns %i", async (status) => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockRejectedValue(new ApiError(status, "Session expired"));
    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("expired"));
    expect(result.current.user).toBeNull();
    expect(users.getStoredAuthToken()).toBeNull();
  });

  it("reports browser storage failure without rejecting account restoration", async () => {
    users.setStoredAuthToken(session.accessToken);
    vi.mocked(users.getAuthenticatedUser).mockRejectedValue(new ApiError(401, "Session expired"));
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("expired"));
    await act(async () => { await expect(result.current.retry()).resolves.toBeUndefined(); });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toContain("browser storage");
    expect(users.getStoredAuthToken()).toBe(session.accessToken);
  });

  it("ignores a restoration response that arrives after logout", async () => {
    users.setStoredAuthToken(session.accessToken);
    const request = deferred<UserProfile>();
    vi.mocked(users.getAuthenticatedUser).mockReturnValue(request.promise);
    const { result } = renderHook(() => useAccount());

    act(() => result.current.logout());
    await act(async () => request.resolve(profile));

    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
    expect(users.getStoredAuthToken()).toBeNull();
  });

  it("does not restore a canceled login or persist its late token", async () => {
    const request = deferred<AuthSession>();
    vi.mocked(users.loginUser).mockReturnValue(request.promise);
    const { result } = renderHook(() => useAccount());
    let login!: Promise<boolean>;
    act(() => { login = result.current.login("account-a", "test-password"); });
    act(() => result.current.logout());
    await act(async () => { request.resolve(session); await login; });

    expect(await login).toBe(false);
    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
    expect(users.getStoredAuthToken()).toBeNull();
  });

  it("ignores a failed login after another tab changes session even before its storage event", async () => {
    const request = deferred<AuthSession>();
    const other = { ...profile, id: "account-b", displayName: "Account B" };
    vi.mocked(users.loginUser).mockReturnValue(request.promise);
    vi.mocked(users.getAuthenticatedUser).mockResolvedValue(other);
    const { result } = renderHook(() => useAccount());
    let login!: Promise<boolean>;
    act(() => { login = result.current.login("account-a", "test-password"); });
    users.setStoredAuthToken("token-b");
    await act(async () => { request.reject(new ApiError(401, "Wrong password")); await login; });
    await waitFor(() => expect(result.current.user?.id).toBe("account-b"));
    expect(users.getStoredAuthToken()).toBe("token-b");
    expect(result.current.error).toBe("");
  });

  it("ignores a second login click while the first request is pending", async () => {
    const request = deferred<AuthSession>();
    vi.mocked(users.loginUser).mockReturnValue(request.promise);
    const { result } = renderHook(() => useAccount());
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.login("account-a", "test-password");
      second = result.current.login("account-a", "test-password");
    });

    expect(users.loginUser).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);
    await act(async () => { request.resolve(session); await first; });
    expect(await first).toBe(true);
    expect(result.current.status).toBe("authenticated");
    expect(users.getStoredAuthToken()).toBe(session.accessToken);
  });

  it("allows a new login after logout while an older canceled login is still pending", async () => {
    const oldRequest = deferred<AuthSession>();
    const newRequest = deferred<AuthSession>();
    const newSession: AuthSession = {
      ...session, accessToken: "token-b", user: { ...profile, id: "account-b" },
    };
    vi.mocked(users.loginUser).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useAccount());
    let oldLogin!: Promise<boolean>;
    let newLogin!: Promise<boolean>;
    act(() => { oldLogin = result.current.login("account-a", "test-password"); });
    act(() => result.current.logout());
    act(() => { newLogin = result.current.login("account-b", "test-password"); });
    await act(async () => { oldRequest.resolve(session); await oldLogin; });

    let duplicate!: boolean;
    await act(async () => { duplicate = await result.current.login("account-b", "test-password"); });
    expect(duplicate).toBe(false);
    expect(users.loginUser).toHaveBeenCalledTimes(2);
    await act(async () => { newRequest.resolve(newSession); await newLogin; });

    expect(await oldLogin).toBe(false);
    expect(await newLogin).toBe(true);
    expect(result.current.user?.id).toBe("account-b");
    expect(users.getStoredAuthToken()).toBe("token-b");
  });
});
