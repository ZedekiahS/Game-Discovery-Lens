import { useState, type SetStateAction } from "react";
import { API_BASE_URL, DATA_MODE } from "../services/runtime";

// Tab memory only: no tokens/passwords and no private drafts shared with another tab/account.
// Survives a session change in this tab; deliberately ends when the page is closed/reloaded.
const drafts = new Map<string, unknown>();
const key = (owner: string | null, field: string) => `${DATA_MODE}:${API_BASE_URL}:${owner}:${field}`;
export function readAccountDraft<T>(owner: string | null, field: string): T | undefined {
  return owner ? drafts.get(key(owner, field)) as T | undefined : undefined;
}
export function discardAccountDraft(owner: string | null, field: string) {
  if (owner) drafts.delete(key(owner, field));
}
export function useAccountDraft<T>(owner: string | null, field: string, initial: T) {
  const [value, setValue] = useState(() => readAccountDraft<T>(owner, field) ?? initial);
  const [restored] = useState(() => readAccountDraft(owner, field) !== undefined);
  function update(next: SetStateAction<T>) {
    setValue(previous => {
      const result = typeof next === "function" ? (next as (v: T) => T)(previous) : next;
      if (owner) drafts.set(key(owner, field), result);
      return result;
    });
  }
  const discard = () => discardAccountDraft(owner, field);
  return [value, update, discard, restored] as const;
}
export function pendingRecordDraft(owner: string | null): number | null {
  if (!owner) return null;
  const prefix = key(owner, "record:");
  const match = [...drafts.keys()].find(k => k.startsWith(prefix));
  return match ? Number(match.slice(prefix.length)) : null;
}
