import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ADD_KEY_SENTINEL,
  DOWNLOAD_SENTINEL,
  ModelPicker,
} from "./ModelPicker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLOUD = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];
const LOCAL = [{ id: "qwen2.5-7b-instruct-q4", label: "Qwen 2.5 7B Instruct" }];

let container: HTMLDivElement;
let root: Root | null = null;

function mount(props: Parameters<typeof ModelPicker>[0]): void {
  root = createRoot(container);
  act(() => {
    root!.render(createElement(ModelPicker, props));
  });
}

function select(): HTMLSelectElement {
  const el = container.querySelector<HTMLSelectElement>(
    "[data-testid='model-picker']",
  );
  expect(el).not.toBeNull();
  return el!;
}

const BASE = {
  cloudModels: CLOUD,
  keyPresent: true,
  localModels: LOCAL,
  localAvailable: true,
  selected: CLOUD[0] as string | null,
  disabled: false,
  onChange: () => {},
};

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

describe("ModelPicker groups", () => {
  test("renders cloud and local optgroups plus download entry", () => {
    mount(BASE);
    const groups = Array.from(select().querySelectorAll("optgroup")).map(
      (g) => g.label,
    );
    expect(groups).toEqual(["Free via OpenRouter", "Local"]);
    const values = Array.from(select().querySelectorAll("option")).map(
      (o) => o.value,
    );
    expect(values).toEqual([
      ...CLOUD,
      "local/qwen2.5-7b-instruct-q4",
      DOWNLOAD_SENTINEL,
    ]);
  });

  test("keyless: cloud options disabled, add-key CTA present", () => {
    mount({ ...BASE, keyPresent: false, selected: null });
    const options = Array.from(select().querySelectorAll("option"));
    const cloud = options.filter((o) => CLOUD.includes(o.value));
    expect(cloud.every((o) => o.disabled)).toBe(true);
    expect(options.some((o) => o.value === ADD_KEY_SENTINEL)).toBe(true);
  });

  test("local group hidden when platform unsupported", () => {
    mount({ ...BASE, localAvailable: false, localModels: [] });
    const groups = Array.from(select().querySelectorAll("optgroup")).map(
      (g) => g.label,
    );
    expect(groups).toEqual(["Free via OpenRouter"]);
  });

  test("change reports the value (including sentinels)", () => {
    const onChange = vi.fn();
    mount({ ...BASE, onChange });
    const el = select();
    act(() => {
      el.value = DOWNLOAD_SENTINEL;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(DOWNLOAD_SENTINEL);
  });

  test("null selection shows the choose-a-model placeholder", () => {
    mount({ ...BASE, keyPresent: false, selected: null });
    expect(select().value).toBe("");
    const placeholder = select().querySelector("option[value='']");
    expect(placeholder?.textContent).toBe("Choose a model");
  });

  test("disabled prop disables the select", () => {
    mount({ ...BASE, disabled: true });
    expect(select().disabled).toBe(true);
  });
});
