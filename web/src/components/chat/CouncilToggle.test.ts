import { createElement, act } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { CouncilToggle } from "./CouncilToggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CouncilToggle", () => {
  test("renders enabled and reflects checked state", () => {
    const out = renderToString(
      createElement(CouncilToggle, { checked: true, available: true, onChange: () => {} }),
    );
    expect(out.toLowerCase()).toContain("council");
    expect(out).not.toContain("disabled");
  });

  test("is disabled with onboarding hint when council unavailable", () => {
    const out = renderToString(
      createElement(CouncilToggle, { checked: false, available: false, onChange: () => {} }),
    );
    expect(out).toContain("disabled");
    // tooltip mentions the key requirement
    expect(out.toLowerCase()).toContain("openrouter");
  });

  test("calls onChange when toggled (enabled)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onChange = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(createElement(CouncilToggle, { checked: false, available: true, onChange }));
    });
    const btn = container.querySelector("button");
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(true);
    act(() => root.unmount());
    container.remove();
  });
});
