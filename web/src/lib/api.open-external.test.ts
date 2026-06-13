import { afterEach, describe, expect, test, vi } from "vitest";
import { openExternal } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
  delete window.__HERMES_DESKTOP__;
});

const OK = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("openExternal", () => {
  test("posts to the desktop bridge when running in the desktop shell", async () => {
    window.__HERMES_DESKTOP__ = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(OK());
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await openExternal("https://openrouter.ai/keys");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/open-external");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      url: "https://openrouter.ai/keys",
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  test("falls back to window.open in a normal browser", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await openExternal("https://openrouter.ai/keys");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith(
      "https://openrouter.ai/keys",
      "_blank",
      "noopener,noreferrer",
    );
  });

  test("falls back to window.open when the desktop bridge fails", async () => {
    window.__HERMES_DESKTOP__ = true;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    await openExternal("https://openrouter.ai/keys");

    expect(openSpy).toHaveBeenCalledWith(
      "https://openrouter.ai/keys",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
