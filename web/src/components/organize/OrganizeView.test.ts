import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OrganizeView } from "./OrganizeView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(props: Parameters<typeof OrganizeView>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(createElement(OrganizeView, props)));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

const BASE = {
  state: undefined as never,
  onSnapshot: () => {},
  onPlan: () => {},
  onApply: () => {},
  onUndo: () => {},
  onAddGrant: () => {},
  onPickFolder: () => {},
  onIntentChange: () => {},
  intent: "",
};

const IDLE = {
  phase: "idle" as const,
  folder: "",
  entries: [],
  plan: null,
  result: null,
  hasManifest: false,
  error: null,
};

describe("OrganizeView", () => {
  it("disables Approve until a plan exists", () => {
    mount({
      ...BASE,
      state: {
        phase: "idle",
        folder: "/d",
        entries: [],
        plan: null,
        result: null,
        hasManifest: false,
        error: null,
      },
    });
    const approve = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Approve & run",
    );
    expect(approve?.hasAttribute("disabled")).toBe(true);
  });

  it("renders every op in the preview", () => {
    mount({
      ...BASE,
      state: {
        phase: "preview",
        folder: "/d",
        entries: [],
        plan: {
          folder: "/d",
          summary: "tidy",
          ops: [
            { op: "mkdir", dst: "/d/img" },
            { op: "move", src: "/d/a.png", dst: "/d/img/a.png" },
          ],
        },
        result: null,
        hasManifest: false,
        error: null,
      },
    });
    expect(document.body.textContent).toContain("/d/img");
    expect(document.body.textContent).toContain("a.png");
    const approve = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.textContent === "Approve & run",
    );
    expect(approve?.hasAttribute("disabled")).toBe(false);
  });

  it("calls onPickFolder when the Choose folder button is clicked", () => {
    let picked = 0;
    mount({ ...BASE, onPickFolder: () => (picked += 1), state: IDLE });
    const btn = Array.from(document.body.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Choose folder"),
    );
    expect(btn).toBeTruthy();
    act(() => btn!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(picked).toBe(1);
  });

  it("enables Undo only when a manifest exists", () => {
    mount({
      ...BASE,
      state: {
        phase: "done",
        folder: "/d",
        entries: [],
        plan: null,
        result: { applied: 2, failed: [], manifest_id: "m" },
        hasManifest: true,
        error: null,
      },
    });
    const undo = Array.from(document.body.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Undo"),
    );
    expect(undo?.hasAttribute("disabled")).toBe(false);
  });
});
