import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LocalModelsInfo } from "@/lib/api";
import { DownloadPanel } from "./DownloadPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function info(overrides?: Partial<LocalModelsInfo>): LocalModelsInfo {
  return {
    available: true,
    detected_ram_gb: 16,
    free_disk_gb: 100,
    models: [
      {
        id: "llama3.2-3b-instruct-q4",
        label: "Llama 3.2 3B Instruct",
        size_bytes: 2019377696,
        min_ram_gb: 8,
        description: "Fast and light.",
        state: "absent",
        progress: 0,
        error: null,
        recommended: false,
      },
      {
        id: "qwen2.5-7b-instruct-q4",
        label: "Qwen 2.5 7B Instruct",
        size_bytes: 4683074240,
        min_ram_gb: 16,
        description: "Balanced.",
        state: "absent",
        progress: 0,
        error: null,
        recommended: true,
      },
      {
        id: "qwen2.5-14b-instruct-q4",
        label: "Qwen 2.5 14B Instruct",
        size_bytes: 8988110976,
        min_ram_gb: 32,
        description: "Highest quality.",
        state: "absent",
        progress: 0,
        error: null,
        recommended: false,
      },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

function mount(props: Parameters<typeof DownloadPanel>[0]): void {
  root = createRoot(container);
  act(() => {
    root!.render(createElement(DownloadPanel, props));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container.remove();
});

const NOOP = { onDownload: () => {}, onDelete: () => {}, onClose: () => {} };

describe("DownloadPanel", () => {
  test("renders all tiers with recommended badge on the best fit", () => {
    mount({ info: info(), ...NOOP });
    const rows = container.querySelectorAll("[data-testid='download-row']");
    expect(rows.length).toBe(3);
    const badges = container.querySelectorAll("[data-testid='recommended-badge']");
    expect(badges.length).toBe(1);
    expect(
      badges[0].closest("[data-testid='download-row']")?.textContent,
    ).toContain("Qwen 2.5 7B");
  });

  test("download click reports the model id", () => {
    const onDownload = vi.fn();
    mount({ info: info(), ...NOOP, onDownload });
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='download-button']",
    );
    act(() => {
      buttons[0].click();
    });
    expect(onDownload).toHaveBeenCalledWith("llama3.2-3b-instruct-q4");
  });

  test("insufficient disk disables download with explanation", () => {
    mount({ info: info({ free_disk_gb: 3 }), ...NOOP });
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='download-button']",
    );
    // 3 GB free: small needs ~2.07 GB (fits), medium ~4.8 GB and large ~9.2 GB do not
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
    expect(container.textContent).toContain("Not enough free disk");
  });

  test("downloading state shows progress, installed shows delete", () => {
    const base = info();
    base.models[0] = { ...base.models[0], state: "downloading", progress: 0.4 };
    base.models[1] = { ...base.models[1], state: "installed", progress: 1 };
    mount({ info: base, ...NOOP });
    const bar = container.querySelector("[data-testid='download-progress']");
    expect(bar?.getAttribute("data-progress")).toBe("0.4");
    expect(
      container.querySelectorAll("[data-testid='delete-button']").length,
    ).toBe(1);
  });

  test("error state shows the message and allows retry", () => {
    const base = info();
    base.models[0] = {
      ...base.models[0],
      state: "error",
      error: "checksum mismatch, download removed",
    };
    mount({ info: base, ...NOOP });
    expect(container.textContent).toContain("checksum mismatch");
    const buttons = container.querySelectorAll<HTMLButtonElement>(
      "[data-testid='download-button']",
    );
    expect(buttons[0].disabled).toBe(false);
  });

  test("close button fires onClose", () => {
    const onClose = vi.fn();
    mount({ info: info(), ...NOOP, onClose });
    const close = container.querySelector<HTMLButtonElement>(
      "[data-testid='download-panel-close']",
    )!;
    act(() => {
      close.click();
    });
    expect(onClose).toHaveBeenCalled();
  });
});
