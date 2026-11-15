import type { PlayerGameInput, PlayerGameRecord, PlayerGameUpdate, PlayerPreferences, PlayerPreferencesSnapshot } from "../types";
import { DATA_MODE } from "./runtime";
import { requestAccount } from "./users";
import { conflictsWithExclusions } from '../lib/tagSemantics';
import { ApiError } from './http';

export const recordConflict = "This game record changed elsewhere. Reload it to review the latest changes.";
const nextTime = (previous?: PlayerGameRecord) => new Date(Math.max(Date.now(), (Date.parse(previous?.updatedAt ?? '') || 0) + 1)).toISOString();

export const emptyPreferences = (): PlayerPreferencesSnapshot => ({ preferredTags: [], avoidedTags: [], version: 0 });
interface PlayerLibraryService {
  getRecords(userId: string): Promise<PlayerGameRecord[]>;
  saveRecord(userId: string, gameId: number, input: PlayerGameInput, expectedUpdatedAt?: string | null): Promise<PlayerGameRecord>;
  updateRecord(userId: string, gameId: number, input: PlayerGameUpdate): Promise<PlayerGameRecord>;
  removeRecord(userId: string, gameId: number, expectedUpdatedAt: string): Promise<void>;
  getPreferences(userId: string): Promise<PlayerPreferencesSnapshot>;
  savePreferences(userId: string, input: PlayerPreferences, expectedVersion?: number): Promise<PlayerPreferencesSnapshot>;
}

const key = (userId: string, type: string) => `game-discovery-lens.demo.player.${encodeURIComponent(userId)}.${type}`;
function mutateDemoRecords<T>(userId: string, write: () => T): Promise<T> {
  // The entire per-user list shares a lock, including writes to different games.
  return navigator.locks ? navigator.locks.request(key(userId, 'games'), write) : Promise.resolve().then(write);
}
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
  async saveRecord(userId, gameId, input, expectedUpdatedAt = null) {
    return mutateDemoRecords(userId, () => {
      const rows = readRecords(userId);
      const previous = rows.find(r => r.gameId === gameId);
      if ((previous?.updatedAt ?? null) !== expectedUpdatedAt) throw new ApiError(409, recordConflict);
      if (input.notes.length > 500) throw new ApiError(422, 'notes: String should have at most 500 characters');
      const row = { ...input, notes: input.notes.trim(), gameId, updatedAt: nextTime(previous) };
      window.localStorage.setItem(key(userId, "games"), JSON.stringify([...rows.filter((r) => r.gameId !== gameId), row]));
      return row;
    });
  },
  async updateRecord(userId, gameId, input) {
    return mutateDemoRecords(userId, () => {
      const rows = readRecords(userId);
      const previous = rows.find((r) => r.gameId === gameId);
      const row = { status: null, affinity: "neutral" as const, notes: "", ...previous, ...input, gameId, updatedAt: nextTime(previous) };
      window.localStorage.setItem(key(userId, "games"), JSON.stringify([...rows.filter((r) => r.gameId !== gameId), row]));
      return row;
    });
  },
  async removeRecord(userId, gameId, expectedUpdatedAt) {
    return mutateDemoRecords(userId, () => {
      const rows = readRecords(userId);
      const previous = rows.find(r => r.gameId === gameId);
      if (previous && previous.updatedAt !== expectedUpdatedAt) throw new ApiError(409, recordConflict);
      window.localStorage.setItem(key(userId, "games"), JSON.stringify(rows.filter((r) => r.gameId !== gameId)));
    });
  },
  async getPreferences(userId) {
    const raw = window.localStorage.getItem(key(userId, "preferences"));
    if (raw === null) return emptyPreferences();
    const prefs: PlayerPreferencesSnapshot = JSON.parse(raw);
    checkPreferences(prefs);
    // Pre-version browser data stays readable; the first guarded edit advances it to 1.
    const version = prefs.version ?? 0;
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('Your preferences could not be loaded.');
    return { ...prefs, version };
  },
  async savePreferences(userId, input, expectedVersion = 0) {
    checkPreferences(input);
    if (input.preferredTags.some(tag => conflictsWithExclusions(tag, input.avoidedTags))) {
      throw new Error('A preferred type is excluded by an avoided type. Remove one of the conflicting choices.');
    }
    const write = async () => {
      const latest = await demo.getPreferences(userId);
      if (latest.version !== expectedVersion) throw new ApiError(409, 'Your preferences changed elsewhere. Reload them to review the latest choices.');
      const saved = { preferredTags: input.preferredTags, avoidedTags: input.avoidedTags, version: latest.version + 1 };
      window.localStorage.setItem(key(userId, "preferences"), JSON.stringify(saved));
      return saved;
    };
    return navigator.locks ? navigator.locks.request(key(userId, 'preferences'), write) : write();
  },
};
const api: PlayerLibraryService = {
  getRecords: (userId) => requestAccount("/me/games", userId),
  saveRecord: (userId, id, input, expectedUpdatedAt = null) => requestAccount(`/me/games/${id}`, userId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, expectedUpdatedAt }),
  }),
  updateRecord: (userId, id, input) => requestAccount(`/me/games/${id}`, userId, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }),
  removeRecord: (userId, id, expectedUpdatedAt) => requestAccount(`/me/games/${id}?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`, userId, { method: "DELETE" }),
  getPreferences: (userId) => requestAccount("/me/preferences", userId),
  savePreferences: (userId, input, expectedVersion = 0) => requestAccount("/me/preferences", userId, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferredTags: input.preferredTags, avoidedTags: input.avoidedTags, expectedVersion }),
  }),
};
export const playerLibrary = DATA_MODE === "api" ? api : demo;
