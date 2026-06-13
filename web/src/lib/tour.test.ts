import { describe, it, expect, afterEach } from "vitest";
import {
  TOUR_DONE_KEY,
  TOUR_PROGRESS_KEY,
  TOUR_STEPS,
  getVisibleSteps,
  initialTourState,
  loadTourProgress,
  saveTourProgress,
  clearTourProgress,
  tourReducer,
} from "./tour";

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("TOUR_STEPS registry", () => {
  it("contains the v1 steps in spec order", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "welcome",
      "nav",
      "chat",
      "studio",
      "freechat",
      "organize",
      "keys",
      "sessions",
      "advanced",
      "finish",
    ]);
  });

  it("gives every step a non-empty title and body", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length, step.id).toBeGreaterThan(0);
      expect(step.body.length, step.id).toBeGreaterThan(0);
    }
  });

  it("centers welcome and finish with no target", () => {
    expect(TOUR_STEPS[0].id).toBe("welcome");
    expect(TOUR_STEPS[0].target).toBeNull();
    expect(TOUR_STEPS.at(-1)?.id).toBe("finish");
    expect(TOUR_STEPS.at(-1)?.target).toBeNull();
  });

  it("offers learnMore on every middle step and none on the bookends", () => {
    const middle = TOUR_STEPS.slice(1, -1);
    for (const step of middle) {
      expect(step.learnMore, step.id).toBeTruthy();
    }
    expect(TOUR_STEPS[0].learnMore).toBeUndefined();
    expect(TOUR_STEPS.at(-1)?.learnMore).toBeUndefined();
  });

  it("routes chat to /sidekick and studio to /studio", () => {
    expect(TOUR_STEPS.find((s) => s.id === "chat")?.route).toBe("/sidekick");
    expect(TOUR_STEPS.find((s) => s.id === "studio")?.route).toBe("/studio");
  });

  it("names the env vars in keys copy without sharing key material", () => {
    const keys = TOUR_STEPS.find((s) => s.id === "keys");
    expect(keys?.learnMore).toContain("OPENROUTER_API_KEY");
    expect(keys?.learnMore).toContain("MUAPI_API_KEY");
  });

  it("uses no em or en dashes anywhere in copy", () => {
    for (const step of TOUR_STEPS) {
      const copy = [step.title, step.body, step.learnMore ?? ""].join(" ");
      expect(copy, step.id).not.toMatch(/[–—]/u);
    }
  });

  it("exposes the persistence key", () => {
    expect(TOUR_DONE_KEY).toBe("sidekick.tour.v1");
  });
});

describe("getVisibleSteps", () => {
  it("keeps untargeted steps and steps whose target exists, drops the rest", () => {
    document.body.innerHTML = '<div data-tour="freechat"></div>';
    const ids = getVisibleSteps(TOUR_STEPS, document, () => true).map((s) => s.id);
    expect(ids).toEqual(["welcome", "chat", "studio", "freechat", "organize", "finish"]);
  });

  it("treats zero-size routeless targets as missing", () => {
    document.body.innerHTML = '<div data-tour="freechat"></div>';
    const ids = getVisibleSteps(TOUR_STEPS, document, () => false).map((s) => s.id);
    expect(ids).toEqual(["welcome", "chat", "studio", "organize", "finish"]);
  });

  it("keeps route-bearing steps even when their target is absent from the current page", () => {
    // chat and studio targets only exist on their own routes; the overlay
    // navigates first and degrades to a centered card if still missing.
    const ids = getVisibleSteps(TOUR_STEPS, document).map((s) => s.id);
    expect(ids).toContain("chat");
    expect(ids).toContain("studio");
  });

  it("returns the bookends plus route-bearing steps for an empty document", () => {
    const ids = getVisibleSteps(TOUR_STEPS, document).map((s) => s.id);
    expect(ids).toEqual(["welcome", "chat", "studio", "organize", "finish"]);
  });
});

describe("tourReducer", () => {
  it("starts closed at step 0", () => {
    expect(initialTourState).toEqual({ open: false, stepIndex: 0 });
  });

  it("open resets to step 0 and opens", () => {
    const state = tourReducer({ open: false, stepIndex: 3 }, { type: "open" });
    expect(state).toEqual({ open: true, stepIndex: 0 });
  });

  it("next advances by one", () => {
    const state = tourReducer({ open: true, stepIndex: 1 }, { type: "next", total: 5 });
    expect(state).toEqual({ open: true, stepIndex: 2 });
  });

  it("next clamps at the last step", () => {
    const state = tourReducer({ open: true, stepIndex: 4 }, { type: "next", total: 5 });
    expect(state.stepIndex).toBe(4);
  });

  it("back retreats by one and clamps at 0", () => {
    expect(tourReducer({ open: true, stepIndex: 2 }, { type: "back" }).stepIndex).toBe(1);
    expect(tourReducer({ open: true, stepIndex: 0 }, { type: "back" }).stepIndex).toBe(0);
  });

  it("close (skip or finish) closes and resets to step 0", () => {
    const state = tourReducer({ open: true, stepIndex: 6 }, { type: "close" });
    expect(state).toEqual({ open: false, stepIndex: 0 });
  });
});

describe("tour progress persistence", () => {
  it("round-trips an in-progress open tour through sessionStorage", () => {
    saveTourProgress({ open: true, stepIndex: 3 });
    expect(loadTourProgress()).toEqual({ open: true, stepIndex: 3 });
  });

  it("returns null when nothing is stored", () => {
    expect(loadTourProgress()).toBeNull();
  });

  it("clears the key when saving a closed tour (nothing to resume)", () => {
    saveTourProgress({ open: true, stepIndex: 2 });
    saveTourProgress({ open: false, stepIndex: 0 });
    expect(sessionStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
    expect(loadTourProgress()).toBeNull();
  });

  it("does not resume a stored closed state", () => {
    sessionStorage.setItem(
      TOUR_PROGRESS_KEY,
      JSON.stringify({ open: false, stepIndex: 0 }),
    );
    expect(loadTourProgress()).toBeNull();
  });

  it("returns null on corrupt JSON", () => {
    sessionStorage.setItem(TOUR_PROGRESS_KEY, "{not json");
    expect(loadTourProgress()).toBeNull();
  });

  it("rejects a non-finite or negative stepIndex", () => {
    sessionStorage.setItem(
      TOUR_PROGRESS_KEY,
      JSON.stringify({ open: true, stepIndex: -2 }),
    );
    expect(loadTourProgress()).toBeNull();
    sessionStorage.setItem(
      TOUR_PROGRESS_KEY,
      JSON.stringify({ open: true, stepIndex: "x" }),
    );
    expect(loadTourProgress()).toBeNull();
  });

  it("clearTourProgress removes a stored tour", () => {
    saveTourProgress({ open: true, stepIndex: 1 });
    clearTourProgress();
    expect(loadTourProgress()).toBeNull();
  });
});
