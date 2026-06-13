import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import { OpenRouterOnboarding } from "./OpenRouterOnboarding";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("OpenRouterOnboarding", () => {
  test("links to the OpenRouter keys page and points at the Keys surface", () => {
    const out = renderToString(createElement(OpenRouterOnboarding, { onRecheck: () => {} }));
    expect(out).toContain("https://openrouter.ai/keys");
    // points users at the in-app Keys page (sidebar), never an inline key field
    expect(out).toContain("key icon in the sidebar");
    // must NOT render any input element - the key never gets typed here
    expect(out).not.toContain("<input");
  });

  test("Re-check button invokes onRecheck", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onRecheck = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(createElement(OpenRouterOnboarding, { onRecheck }));
    });
    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").toLowerCase().includes("re-check"),
    );
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRecheck).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    container.remove();
  });
});
