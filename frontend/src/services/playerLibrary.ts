import type { PlayerGameInput, PlayerGameRecord, PlayerGameUpdate, PlayerPreferences } from "../types";
import { DATA_MODE } from "./runtime";
import { requestAccount } from "./users";

export const emptyPreferences = (): PlayerPreferences => ({ preferredTags: [], avoidedTags: [] });
interface PlayerLibraryService {
  getRecords(userId: string): Promise<PlayerGameRecord[]>;
  saveRecord(userId: string, gameId: number, input: PlayerGameInput): Promise<PlayerGameRecord>;
  updateRecord(userId: string, gameId: number, input: PlayerGameUpdate): Promise<PlayerGameRecord>;
  removeRecord(userId: string, gameId: number): Promise<void>;
  getPreferences(userId: string): Promise<PlayerPreferences>;
  savePreferences(userId: string, input: PlayerPreferences): Promise<PlayerPreferences>;
}

const key = (userId: string, type: string) => `game-discovery-lens.demo.player.${encodeURIComponent(userId)}.${type}`;
function readRecords(userId: string): PlayerGameRecord[] {
  const raw = window.localStorage.getItem(key(userId, "games"));
  if (raw === null) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.some((r) => !r || !Number.isInteger(r.gameId)
    || ![null, "want_to_play", "playing", "played"].includes(r.status)
    || !["neutral", "like", "dislike"].includes(r.affinity) || typeof r.notes !== "string"
    || typeof r.updatedAt !== "string")) throw new Error("Your game records could not be loaded.");
  return rows;
}
function checkPreferences(input: PlayerPreferences) {
  if (!input || !Array.isArray(input.preferredTags) || !Array.isArray(input.avoidedTags)
    || input.preferredTags.length > 12 || input.avoidedTags.length > 12
    || [...input.preferredTags, ...input.avoidedTags].some((tag) => typeof tag !== "string")
    || input.preferredTags.some((tag) => input.avoidedTags.includes(tag))) {
    throw new Error("Your preferences could not be saved. Choose up to 12 tags per group without overlap.");
  }
}
const demo: PlayerLibraryService = {
  async getRecords(userId) { return readRecords(userId); },
  async saveRecord(userId, gameId, input) {
    const rows = readRecords(userId);
    const row = { ...input, notes: input.notes.trim(), gameId, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(key(userId, "games"), JSON.stringify([...rows.filter((r) => r.gameId !== gameId), row]));
    return row;
  },
  async updateRecord(userId, gameId, input) {
    const rows = readRecords(userId);
    const previous = rows.find((r) => r.gameId === gameId);
    const row = { status: null, affinity: "neutral" as const, notes: "", ...previous, ...input, gameId, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(key(userId, "games"), JSON.stringify([...rows.filter((r) => r.gameId !== gameId), row]));
    return row;
  },
  async removeRecord(userId, gameId) {
    const rows = readRecords(userId);
    window.localStorage.setItem(key(userId, "games"), JSON.stringify(rows.filter((r) => r.gameId !== gameId)));
  },
  async getPreferences(userId) {
    const raw = window.localStorage.getItem(key(userId, "preferences"));
    if (raw === null) return emptyPreferences();
    const prefs: PlayerPreferences = JSON.parse(raw);
    checkPreferences(prefs);
    return prefs;
  },
  async savePreferences(userId, input) {
    checkPreferences(input);
    window.localStorage.setItem(key(userId, "preferences"), JSON.stringify(input));
    return input;
  },
};
const api: PlayerLibraryService = {
  getRecords: (userId) => requestAccount("/me/games", userId),
  saveRecord: (userId, id, input) => requestAccount(`/me/games/${id}`, userId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }),
  updateRecord: (userId, id, input) => requestAccount(`/me/games/${id}`, userId, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }),
  removeRecord: (userId, id) => requestAccount(`/me/games/${id}`, userId, { method: "DELETE" }),
  getPreferences: (userId) => requestAccount("/me/preferences", userId),
  savePreferences: (userId, input) => requestAccount("/me/preferences", userId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }),
};
export const playerLibrary = DATA_MODE === "api" ? api : demo;
