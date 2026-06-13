import { describe, expect, test } from "vitest";
import { friendlyModelLabel } from "./model-label";

describe("friendlyModelLabel", () => {
  test("takes the slug tail and strips :free", () => {
    expect(friendlyModelLabel("nvidia/nemotron-3-super-120b-a12b:free")).toBe(
      "nemotron-3-super-120b-a12b",
    );
  });

  test("plain slug without provider passes through", () => {
    expect(friendlyModelLabel("gpt-5.1")).toBe("gpt-5.1");
  });

  test("strips :free even without a provider prefix", () => {
    expect(friendlyModelLabel("llama-3.3-70b-instruct:free")).toBe("llama-3.3-70b-instruct");
  });
});
