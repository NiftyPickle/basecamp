// localStorage-backed generation history. All updates are immutable: load
// returns a fresh array, append builds a new array and writes it. Capped to
// bound storage. Corrupt or missing storage degrades to an empty list.

import type { StudioMode } from "./studio-catalog";

const KEY = "hermes.studio.history";
export const HISTORY_CAP = 50;

export type HistoryEntry = {
  id: string;
  mode: StudioMode | "effect" | "enhance" | "marketing" | "lipsync";
  media: "image" | "video";
  model: string;
  prompt: string;
  outputs: string[];
  ts: number;
};

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Append an entry newest-first, cap the list, persist, and return the new list.
 * Does not mutate any existing array. `ts` is injected by the caller (Date.now)
 * so this stays pure and testable. */
export function appendHistory(entry: Omit<HistoryEntry, "ts">, ts: number): HistoryEntry[] {
  const next: HistoryEntry[] = [{ ...entry, ts }, ...loadHistory()].slice(0, HISTORY_CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable; history is best-effort
  }
  return next;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
