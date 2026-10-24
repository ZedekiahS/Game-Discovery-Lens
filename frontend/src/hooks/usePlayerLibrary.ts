import { getVerifiedSession, checkSession, isCurrentSession } from "../services/users";
import { useEffect, useRef, useState } from "react";
import type { PlayerGameInput, PlayerGameRecord, PlayerGameUpdate, PlayerPreferences } from "../types";
import { emptyPreferences, playerLibrary } from "../services/playerLibrary";

const initial = (scope: string) => ({ scope, records: [] as PlayerGameRecord[], preferences: emptyPreferences(), loaded: false, loading: true, busy: false, error: "" });

export function usePlayerLibrary(userId: string | null, revision: number) {
  const session = getVerifiedSession();
  const scope = `${userId ?? "anonymous"}:${revision}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const generation = useRef(0);
  const pending = useRef<symbol | null>(null);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState(() => initial(scope));
  const visible = state.scope === scope ? state : initial(scope);

  useEffect(() => {
    const request = ++generation.current;
    pending.current = null;
    setState((previous) => ({ ...(previous.scope === scope ? previous : initial(scope)), loading: userId !== null }));
    const current = () => generation.current === request && currentScope.current === scope;
    if (userId) void Promise.all([playerLibrary.getRecords(userId), playerLibrary.getPreferences(userId)])
      .then(([records, preferences]) => { if (current()) setState({ ...initial(scope), records, preferences, loaded: true, loading: false }); })
      .catch(() => { if (current()) setState((previous) => ({ ...previous, loading: false, error: "Your game records could not be loaded." })); });
    return () => { ++generation.current; };
  }, [scope, userId, reload]);

  async function change<T>(action: () => Promise<T>, apply: (previous: typeof state, result: T) => typeof state): Promise<boolean> {
    if (!userId || visible.loading || visible.error || state.scope !== scope || pending.current) return false;
    if (!checkSession(session)) return false;
    const operation = Symbol();
    pending.current = operation;
    const request = generation.current;
    const current = () => currentScope.current === scope && generation.current === request && isCurrentSession(session);
    setState((s) => ({ ...s, busy: true, error: "" }));
    try {
      const result = await action();
      if (!current()) return false;
      setState((s) => ({ ...apply(s, result), busy: false }));
      return true;
    } catch {
      if (current()) setState((s) => ({ ...s, busy: false, error: "Your changes could not be confirmed. Reload your library before trying again." }));
      return false;
    } finally {
      if (pending.current === operation) pending.current = null;
    }
  }

  return {
    ...visible,
    loading: userId !== null && visible.loading,
    saveRecord: (id: number, input: PlayerGameInput) => change(() => playerLibrary.saveRecord(userId!, id, input),
      (s, record) => ({ ...s, records: [...s.records.filter((r) => r.gameId !== id), record] })),
    updateRecord: (id: number, input: PlayerGameUpdate) => change(() => playerLibrary.updateRecord(userId!, id, input),
      (s, record) => ({ ...s, records: [...s.records.filter((r) => r.gameId !== id), record] })),
    removeRecord: (id: number) => change(() => playerLibrary.removeRecord(userId!, id),
      (s) => ({ ...s, records: s.records.filter((r) => r.gameId !== id) })),
    savePreferences: (input: PlayerPreferences) => change(() => playerLibrary.savePreferences(userId!, input),
      (s, preferences) => ({ ...s, preferences })),
    retry: () => { if (!pending.current) setReload((n) => n + 1); },
  };
}
