import { describe, it, expect, beforeEach } from "vitest";
import {
  loadHistory,
  appendHistory,
  clearHistory,
  HISTORY_CAP,
  type HistoryEntry,
} from "./studio-history";

function entry(id: string): Omit<HistoryEntry, "ts"> {
  return { id, mode: "t2i", media: "image", model: "flux-dev", prompt: "p", outputs: ["https://x/a.png"] };
}

describe("studio-history", () => {
  beforeEach(() => localStorage.clear());

  it("returns [] when empty", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("appends newest-first and does not mutate the input array", () => {
    const before = loadHistory();
    const after = appendHistory(entry("a"), 1000);
    expect(before).toEqual([]); // original untouched
    expect(after[0].id).toBe("a");
    expect(after[0].ts).toBe(1000);
    const after2 = appendHistory(entry("b"), 2000);
    expect(after2.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("persists across loads", () => {
    appendHistory(entry("a"), 1);
    expect(loadHistory().map((e) => e.id)).toEqual(["a"]);
  });

  it("caps at HISTORY_CAP, dropping the oldest", () => {
    for (let i = 0; i < HISTORY_CAP + 5; i++) appendHistory(entry(`e${i}`), i);
    const all = loadHistory();
    expect(all.length).toBe(HISTORY_CAP);
    expect(all[0].id).toBe(`e${HISTORY_CAP + 4}`); // newest kept
    expect(all.some((e) => e.id === "e0")).toBe(false); // oldest dropped
  });

  it("clearHistory empties storage", () => {
    appendHistory(entry("a"), 1);
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("hermes.studio.history", "{not json");
    expect(loadHistory()).toEqual([]);
  });
});
