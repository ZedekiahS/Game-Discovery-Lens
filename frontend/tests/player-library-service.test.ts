import { verifiedAccount } from "./session-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); window.localStorage.clear(); window.history.replaceState(null, "", "/"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const draft = { status: "played" as const, affinity: "like" as const, notes: "Personal note" };
describe("player library persistence adapters", () => {
  it("patches only the selected preference, retaining the latest note and other fields", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const { playerLibrary } = await import("../src/services/playerLibrary");
    await playerLibrary.saveRecord("a", 2, { ...draft, status: "playing" });
    await playerLibrary.updateRecord("a", 2, { affinity: "dislike" });
    expect(await playerLibrary.getRecords("a")).toMatchObject([{ notes: draft.notes, status: "playing", affinity: "dislike" }]);
    await playerLibrary.updateRecord("a", 2, { status: null });
    expect(await playerLibrary.getRecords("a")).toMatchObject([{ notes: draft.notes, status: null, affinity: "dislike" }]);
    expect(await playerLibrary.getRecords("b")).toEqual([]);
  });
  it("sends minimal authenticated PATCH requests and reports failed writes", async () => {
    vi.stubEnv("VITE_DATA_MODE", "api");
    const { setStoredAuthToken } = await import("../src/services/users");
    await verifiedAccount("a", "a-token");
    const { playerLibrary } = await import("../src/services/playerLibrary");
    const request = vi.fn().mockResolvedValue(new Response('{"detail":"Unavailable"}', { status: 503 }));
    vi.stubGlobal("fetch", request);
    await expect(playerLibrary.updateRecord("a", 2, { affinity: "like" })).rejects.toMatchObject({ status: 503 });
    expect(request.mock.calls[0][1]).toMatchObject({ method: "PATCH", headers: { Authorization: "Bearer a-token" }, body: '{"affinity":"like"}' });
  });
  it("keeps local accounts separate, persists edits, and leaves corrupt records untouched", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const { playerLibrary } = await import("../src/services/playerLibrary");
    await playerLibrary.saveRecord("a", 2, draft);
    await playerLibrary.saveRecord("a", 2, { ...draft, status: "playing" });
    expect(await playerLibrary.getRecords("a")).toMatchObject([{ gameId: 2, status: "playing" }]);
    expect(await playerLibrary.getRecords("b")).toEqual([]);
    window.localStorage.setItem("game-discovery-lens.demo.player.a.games", "broken");
    await expect(playerLibrary.saveRecord("a", 3, draft)).rejects.toThrow();
    expect(window.localStorage.getItem("game-discovery-lens.demo.player.a.games")).toBe("broken");
  });
  it("uses bearer ownership and never falls back to browser success after an API error", async () => {
    vi.stubEnv("VITE_DATA_MODE", "api");
    const users = await import("../src/services/users");
    await verifiedAccount("a", "a-token");
    const { playerLibrary } = await import("../src/services/playerLibrary");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Unavailable" }), { status: 503 }));
    vi.stubGlobal("fetch", request);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await expect(playerLibrary.saveRecord("a", 2, draft)).rejects.toMatchObject({ status: 503 });
    const [url, init] = request.mock.calls[0];
    expect(url).toMatch(/\/me\/games\/2$/);
    expect(init.headers.Authorization).toBe("Bearer a-token");
    expect(JSON.parse(init.body)).toEqual(draft);
    expect(writes).not.toHaveBeenCalled();
  });
});
