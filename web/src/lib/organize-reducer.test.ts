import { describe, expect, it } from "vitest";
import { initialOrganizeState, organizeReducer } from "./organize-reducer";

const PLAN = { folder: "/d", summary: "sort", ops: [{ op: "mkdir" as const, dst: "/d/img" }] };

describe("organize-reducer", () => {
  it("starts idle", () => {
    expect(initialOrganizeState.phase).toBe("idle");
  });

  it("walks the happy path idle -> done", () => {
    let s = organizeReducer(initialOrganizeState, { type: "snapshotStart", folder: "/d" });
    expect(s.phase).toBe("snapshotting");
    expect(s.folder).toBe("/d");

    s = organizeReducer(s, { type: "snapshotOk", entries: [] });
    expect(s.phase).toBe("idle");

    s = organizeReducer(s, { type: "planStart" });
    expect(s.phase).toBe("planning");

    s = organizeReducer(s, { type: "planOk", plan: PLAN });
    expect(s.phase).toBe("preview");
    expect(s.plan).toEqual(PLAN);

    s = organizeReducer(s, { type: "applyStart" });
    expect(s.phase).toBe("applying");

    s = organizeReducer(s, { type: "applyOk", result: { applied: 1, failed: [], manifest_id: "m" } });
    expect(s.phase).toBe("done");
    expect(s.hasManifest).toBe(true);
  });

  it("captures errors and clears them on reset", () => {
    let s = organizeReducer(initialOrganizeState, { type: "planStart" });
    s = organizeReducer(s, { type: "error", message: "boom" });
    expect(s.phase).toBe("error");
    expect(s.error).toBe("boom");
    s = organizeReducer(s, { type: "reset" });
    expect(s.phase).toBe("idle");
    expect(s.error).toBeNull();
  });

  it("marks no manifest after undo", () => {
    let s = organizeReducer({ ...initialOrganizeState, hasManifest: true }, { type: "undoOk" });
    expect(s.hasManifest).toBe(false);
  });
});
