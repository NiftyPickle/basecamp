import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TOUR_DONE_KEY, TOUR_PROGRESS_KEY } from "@/lib/tour";
import { TourLauncher } from "./TourLauncher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(createElement(MemoryRouter, null, createElement(TourLauncher)));
  });
  return container;
}

/** Records every location change, including same-path pushes (new key). */
function LocationLog({ log }: { log: string[] }) {
  const location = useLocation();
  useEffect(() => {
    log.push(location.pathname);
  }, [location, log]);
  return null;
}

function mountWithLocationLog(log: string[]): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(
        MemoryRouter,
        null,
        createElement(TourLauncher),
        createElement(LocationLog, { log }),
      ),
    );
  });
  return container;
}

// The overlay is portaled to <body>, so it is a sibling of the test
// container, not a descendant. Query the document for overlay content.
function overlay(): Element | null {
  return document.body.querySelector("[data-tour-overlay]") ?? null;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("TourLauncher", () => {
  it("auto-opens the tour on first visit", () => {
    mount();
    expect(overlay()).not.toBeNull();
    expect(document.body.textContent).toContain("Welcome to Basecamp");
  });

  it("does not auto-open when the tour is already done", () => {
    localStorage.setItem(TOUR_DONE_KEY, "done");
    mount();
    expect(overlay()).toBeNull();
  });

  it("always renders the Tour button", () => {
    localStorage.setItem(TOUR_DONE_KEY, "done");
    mount();
    const button = document.body.querySelector('button[aria-label="Open the guided tour"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Tour");
  });

  it("reopens the tour at step 0 when the launcher button is clicked", () => {
    localStorage.setItem(TOUR_DONE_KEY, "done");
    mount();
    click(document.body.querySelector('button[aria-label="Open the guided tour"]')!);
    expect(overlay()).not.toBeNull();
    expect(document.body.textContent).toContain("Welcome to Basecamp");
  });

  it("marks the tour done and closes when skipped", () => {
    mount();
    const skip = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Skip tour",
    );
    expect(skip).toBeTruthy();
    click(skip!);
    expect(overlay()).toBeNull();
    expect(localStorage.getItem(TOUR_DONE_KEY)).toBe("done");
  });

  it("moves focus into the tour card when the tour opens", () => {
    mount();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(dialog);
  });

  it("returns focus to the launcher button when the tour closes", () => {
    mount();
    const skip = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Skip tour",
    );
    expect(skip).toBeTruthy();
    click(skip!);
    const button = document.body.querySelector('button[aria-label="Open the guided tour"]');
    expect(document.activeElement).toBe(button);
  });

  it("navigates a routed step exactly once", () => {
    const log: string[] = [];
    mountWithLocationLog(log);
    // welcome -> chat, which routes to /sidekick. An unstable onNavigate
    // identity would re-run the overlay measure effect and push a second
    // history entry for the same pathname.
    const next = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Next",
    );
    expect(next).toBeTruthy();
    click(next!);
    expect(log.filter((p) => p === "/sidekick").length).toBe(1);
  });

  it("marks the tour done when finished from the last step", () => {
    mount();
    // jsdom reports zero rects, so the visible steps are the untargeted
    // bookends plus the route-bearing chat, studio, and organize steps:
    // four Next clicks reach the last step.
    for (let i = 0; i < 4; i++) {
      const next = Array.from(document.body.querySelectorAll("button")).find(
        (b) => b.textContent === "Next",
      );
      expect(next, `Next click ${i + 1}`).toBeTruthy();
      click(next!);
    }
    const finish = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Finish",
    );
    expect(finish).toBeTruthy();
    click(finish!);
    expect(overlay()).toBeNull();
    expect(localStorage.getItem(TOUR_DONE_KEY)).toBe("done");
  });

  it("resumes an in-progress tour after a reload instead of restarting at welcome", () => {
    // A routed step (here studio, visible index 2) hit a stale-token 401,
    // fetchJSON reloaded the page, and the tour parked its progress in
    // sessionStorage. DONE_KEY is unset because the tour never finished.
    sessionStorage.setItem(
      TOUR_PROGRESS_KEY,
      JSON.stringify({ open: true, stepIndex: 2 }),
    );
    const log: string[] = [];
    mountWithLocationLog(log);
    expect(overlay()).not.toBeNull();
    // The bug being fixed: it must NOT snap back to the welcome card.
    expect(document.body.textContent).not.toContain("Welcome to Basecamp");
    // The studio step carries route /studio; resuming re-navigates there.
    expect(log).toContain("/studio");
  });

  it("persists tour progress on advance so a reload can resume it", () => {
    mount();
    const next = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Next",
    );
    click(next!);
    const saved = JSON.parse(sessionStorage.getItem(TOUR_PROGRESS_KEY) ?? "null");
    expect(saved).toMatchObject({ open: true, stepIndex: 1 });
  });

  it("clears persisted progress when the tour is skipped", () => {
    mount();
    const skip = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Skip tour",
    );
    click(skip!);
    expect(sessionStorage.getItem(TOUR_PROGRESS_KEY)).toBeNull();
  });
});
