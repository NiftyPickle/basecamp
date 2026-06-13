import { afterEach, describe, expect, test, vi } from "vitest";
import { getOpenRouterInfo, type OpenRouterInfo } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getOpenRouterInfo", () => {
  test("fetches and returns the info envelope", async () => {
    const payload: OpenRouterInfo = {
      key_present: true,
      free_models: ["meta-llama/llama-3.3-70b-instruct:free"],
      council_available: true,
      council_default_models: ["anthropic/claude-sonnet-4.5"],
    };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const info = await getOpenRouterInfo();
    expect(info).toEqual(payload);
    const calledUrl = String(spy.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/openrouter/info");
  });
});
