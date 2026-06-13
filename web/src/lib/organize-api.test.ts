import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addGrant,
  applyPlan,
  getGrants,
  getSnapshot,
  requestPlan,
  revokeGrant,
  undoLast,
} from "./organize-api";

function stubFetch(body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("organize-api", () => {
  it("getGrants hits the grants endpoint with GET", async () => {
    const fn = stubFetch({ desktop: "/d", grants: [] });
    const out = await getGrants();
    expect(out).toEqual({ desktop: "/d", grants: [] });
    const [url, init] = fn.mock.calls[0];
    expect(url).toContain("/api/organize/grants");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("getSnapshot encodes the dir query parameter", async () => {
    const fn = stubFetch({ folder: "/d", entries: [] });
    await getSnapshot("/d/my files");
    expect(fn.mock.calls[0][0]).toContain(
      "/api/organize/snapshot?dir=" + encodeURIComponent("/d/my files"),
    );
  });

  it("addGrant POSTs JSON with a Content-Type header", async () => {
    const fn = stubFetch({ path: "/d/x" });
    await addGrant("/d/x");
    const init = fn.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ path: "/d/x" });
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("revokeGrant POSTs the path", async () => {
    const fn = stubFetch({ ok: true });
    await revokeGrant("/d/x");
    const init = fn.mock.calls[0][1]!;
    expect(fn.mock.calls[0][0]).toContain("/api/organize/revoke");
    expect(JSON.parse(init.body as string)).toEqual({ path: "/d/x" });
  });

  it("requestPlan POSTs folder and intent", async () => {
    const fn = stubFetch({ folder: "/d", summary: "", ops: [] });
    await requestPlan("/d", "sort by type");
    const init = fn.mock.calls[0][1]!;
    expect(fn.mock.calls[0][0]).toContain("/api/organize/plan");
    expect(JSON.parse(init.body as string)).toEqual({ folder: "/d", intent: "sort by type" });
  });

  it("applyPlan wraps the plan under a plan key", async () => {
    const fn = stubFetch({ applied: 1, failed: [], manifest_id: "m" });
    const plan = { folder: "/d", summary: "", ops: [] };
    await applyPlan(plan);
    const init = fn.mock.calls[0][1]!;
    expect(JSON.parse(init.body as string)).toEqual({ plan });
  });

  it("undoLast POSTs an empty body", async () => {
    const fn = stubFetch({ reversed: 0 });
    await undoLast();
    const init = fn.mock.calls[0][1]!;
    expect(fn.mock.calls[0][0]).toContain("/api/organize/undo");
    expect(JSON.parse(init.body as string)).toEqual({});
  });
});
