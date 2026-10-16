import { afterEach, describe, expect, it, vi } from "vitest";
import { requestApi } from "../src/services/http";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("request deadlines", () => {
  it("aborts a stalled write and reports an uncertain outcome without retrying it", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetch);
    const outcome = requestApi("/collections", { method: "POST" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await outcome).message).toContain("timed out");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the deadline active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => ({
      ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    })));
    const outcome = requestApi("/collections").catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await outcome).message).toContain("timed out");
  });

  it("cleans up deadlines and keeps server errors intact", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Email is already registered" }), { status: 409 })));
    await expect(requestApi("/saved-games/1", { method: "DELETE" })).resolves.toBeUndefined();
    await expect(requestApi("/auth/register")).rejects.toMatchObject({ status: 409, message: "Email is already registered" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves caller cancellation", async () => {
    const caller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const outcome = requestApi("/games", { signal: caller.signal }).catch((e) => e);
    caller.abort();
    expect((await outcome).status).toBe(0);
  });
});
