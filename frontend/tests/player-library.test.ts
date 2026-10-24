import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerLibrary } from "../src/hooks/usePlayerLibrary";
import { playerLibrary } from "../src/services/playerLibrary";
import type { PlayerGameRecord } from "../src/types";

vi.mock("../src/services/runtime", () => ({ DATA_MODE: "demo", API_BASE_URL: "http://localhost:8000/api" }));
vi.mock("../src/services/playerLibrary", () => ({
  emptyPreferences: () => ({ preferredTags: [], avoidedTags: [] }),
  playerLibrary: { getRecords: vi.fn(), getPreferences: vi.fn(), saveRecord: vi.fn(), removeRecord: vi.fn(), savePreferences: vi.fn() },
}));
const row: PlayerGameRecord = { gameId: 2, status: "playing", affinity: "like", notes: "A private note", updatedAt: "" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(playerLibrary.getRecords).mockResolvedValue([]);
  vi.mocked(playerLibrary.getPreferences).mockResolvedValue({ preferredTags: [], avoidedTags: [] });
});
afterEach(cleanup);

describe("private library state", () => {
  it("hides old account records immediately and ignores late responses", async () => {
    let resolve!: (r: PlayerGameRecord[]) => void;
    vi.mocked(playerLibrary.getRecords).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ id }) => usePlayerLibrary(id, 0), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => resolve([row]));
    expect(result.current.records).toEqual([]);
  });
  it("does not publish a late save after signing out", async () => {
    let resolve!: (r: PlayerGameRecord) => void;
    vi.mocked(playerLibrary.saveRecord).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => usePlayerLibrary(id, 0), { initialProps: { id: "a" as string | null } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.saveRecord(2, row); });
    rerender({ id: null });
    await act(async () => { resolve(row); await pending; });
    expect(result.current.records).toEqual([]);
    expect(await pending).toBe(false);
  });
  it("blocks double writes, preserves confirmed state after failure, and reconciles on reload", async () => {
    let reject!: (e: Error) => void;
    vi.mocked(playerLibrary.saveRecord).mockReturnValue(new Promise((_done, fail) => { reject = fail; }));
    const { result } = renderHook(() => usePlayerLibrary("a", 0));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let first!: Promise<boolean>;
    act(() => { first = result.current.saveRecord(2, row); });
    expect(await result.current.saveRecord(2, row)).toBe(false);
    await act(async () => { reject(new Error("timeout")); await first; });
    expect(result.current.records).toEqual([]);
    expect(result.current.error).toContain("could not be confirmed");
    expect(playerLibrary.saveRecord).toHaveBeenCalledTimes(1);
    vi.mocked(playerLibrary.getRecords).mockResolvedValue([row]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.records).toEqual([row]));
    expect(result.current.error).toBe("");
  });
});
