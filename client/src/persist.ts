// Browser-side persistence so a refresh or navigation never loses work. The server holds the
// durable copy (project inputs, plan versions, jobs); localStorage keeps the session pointer and
// edits that haven't been saved as a plan version yet.
import { useEffect, useState } from "react";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the server copy still holds saved work.
  }
}

/** useState that mirrors its value to localStorage. */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue] as const;
}

export const keys = {
  session: "ep.session",
  form: "ep.setupForm",
  planDraft: (projectId: string) => `ep.planDraft.${projectId}`,
};
