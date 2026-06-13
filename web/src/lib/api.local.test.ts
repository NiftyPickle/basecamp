import { afterEach, describe, expect, test, vi } from "vitest";
import { deleteLocalModel, getLocalModels, startLocalModelDownload } from "./api";

const INFO = {
  available: true,
  detected_ram_gb: 16,
  free_disk_gb: 100,
  models: [],
};

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("local model api", () => {
  test("getLocalModels hits GET /api/local/models", async () => {
    const spy = mockFetch(INFO);
    const info = await getLocalModels();
    expect(info.available).toBe(true);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/api/local/models");
    expect(init?.method ?? "GET").toBe("GET");
  });

  test("startLocalModelDownload POSTs to the download endpoint", async () => {
    const spy = mockFetch({ ok: true });
    await startLocalModelDownload("qwen2.5-7b-instruct-q4");
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain(
      "/api/local/models/qwen2.5-7b-instruct-q4/download",
    );
    expect(init?.method).toBe("POST");
  });

  test("deleteLocalModel sends DELETE", async () => {
    const spy = mockFetch({ ok: true });
    await deleteLocalModel("qwen2.5-7b-instruct-q4");
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain("/api/local/models/qwen2.5-7b-instruct-q4");
    expect(init?.method).toBe("DELETE");
  });
});
