import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { TourStep } from "@/lib/tour";
import { TourOverlay, cardPosition, measureTarget } from "./TourOverlay";

const FIXTURE: TourStep[] = [
  { id: "a", target: null, title: "Step A title", body: "Step A body" },
  {
    id: "b",
    target: '[data-tour="b"]',
    title: "Step B title",
    body: "Step B body",
    learnMore: "Deep dive into B setup",
  },
  { id: "c", target: null, title: "Step C title", body: "Step C body" },
];

function render(stepIndex: number): string {
  return renderToString(
    createElement(TourOverlay, {
      steps: FIXTURE,
      stepIndex,
      onNext: () => {},
      onBack: () => {},
      onSkip: () => {},
      onFinish: () => {},
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TourOverlay rendering", () => {
  it("renders the current step title and body", () => {
    const html = render(0);
    expect(html).toContain("Step A title");
    expect(html).toContain("Step A body");
    expect(html).not.toContain("Step B title");
  });

  it("renders Learn More content inside a details element", () => {
    const html = render(1);
    expect(html).toMatch(/<details[\s\S]*Deep dive into B setup[\s\S]*<\/details>/);
    expect(html).toContain("Learn More");
  });

  it("omits the details element when a step has no learnMore", () => {
    expect(render(0)).not.toContain("<details");
  });

  it("renders one progress dot per step", () => {
    const html = render(0);
    expect((html.match(/data-tour-dot/g) ?? []).length).toBe(FIXTURE.length);
    expect((html.match(/data-tour-dot="active"/g) ?? []).length).toBe(1);
  });

  it("hides the dots from assistive tech and announces progress as text", () => {
    const html = render(0);
    expect(html).toMatch(/<div aria-hidden="true"[^>]*>[\s\S]*?data-tour-dot/);
    expect(html).toContain(">Step 1 of 3<");
  });

  it("disables Back on the first step", () => {
    expect(render(0)).toMatch(/<button[^>]*disabled[^>]*>[\s\S]{0,40}?Back/);
  });

  it("shows Next on middle steps and Finish on the last step", () => {
    expect(render(1)).toContain("Next");
    expect(render(2)).toContain("Finish");
    expect(render(2)).not.toContain(">Next<");
  });

  it("always offers Skip tour", () => {
    expect(render(0)).toContain("Skip tour");
    expect(render(2)).toContain("Skip tour");
  });

  it("marks the overlay root for tests and launchers", () => {
    expect(render(0)).toContain("data-tour-overlay");
  });

  it("makes the dialog card programmatically focusable", () => {
    expect(render(0)).toMatch(/role="dialog"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="dialog"/);
  });
});

describe("measureTarget", () => {
  it("returns null for a null selector", () => {
    expect(measureTarget(null)).toBeNull();
  });

  it("returns null when the selector matches nothing", () => {
    expect(measureTarget('[data-tour="missing"]')).toBeNull();
  });

  it("returns null for a zero-size element (jsdom default rect)", () => {
    document.body.innerHTML = '<div data-tour="zero"></div>';
    expect(measureTarget('[data-tour="zero"]')).toBeNull();
  });

  it("measures a sized element and opens closed ancestor details", () => {
    document.body.innerHTML =
      '<details><summary>adv</summary><div id="t"></div></details>';
    const el = document.getElementById("t") as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        top: 10,
        left: 20,
        width: 30,
        height: 40,
        right: 50,
        bottom: 50,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(measureTarget("#t")).toEqual({ top: 10, left: 20, width: 30, height: 40 });
    expect((document.querySelector("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("scrolls the target into view before measuring", () => {
    document.body.innerHTML = '<div id="s"></div>';
    const el = document.getElementById("s") as HTMLElement;
    el.getBoundingClientRect = () =>
      ({
        top: 5,
        left: 5,
        width: 10,
        height: 10,
        right: 15,
        bottom: 15,
        x: 5,
        y: 5,
        toJSON: () => ({}),
      }) as DOMRect;
    const calls: unknown[] = [];
    el.scrollIntoView = (opts?: boolean | ScrollIntoViewOptions) => {
      calls.push(opts);
    };
    measureTarget("#s");
    expect(calls).toEqual([{ block: "nearest" }]);
  });
});

describe("cardPosition", () => {
  it("places the card below the halo when there is room", () => {
    const pos = cardPosition({ top: 100, left: 50, width: 200, height: 40 }, 1280, 800);
    expect(pos.top).toBe(100 + 40 + 6 + 12);
    expect(pos.left).toBe(50);
  });

  it("flips the card above the target near the bottom edge", () => {
    const pos = cardPosition({ top: 700, left: 50, width: 200, height: 60 }, 1280, 800);
    expect(pos.top).toBe(700 - 6 - 12 - 280);
  });

  it("clamps the card inside the right viewport edge", () => {
    const pos = cardPosition({ top: 100, left: 1200, width: 60, height: 40 }, 1280, 800);
    expect(pos.left).toBe(1280 - 320 - 12);
  });
});
