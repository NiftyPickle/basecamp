import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StudioJob } from "@/lib/studio-api";

const getStudioJob = vi.fn();
vi.mock("@/lib/studio-api", () => ({
  getStudioJob: (...args: unknown[]) => getStudioJob(...args),
}));

import { errText, useStudioJob } from "./useStudioJob";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const POLL_MS = 2500;
const POLL_MAX = 120;

const running: StudioJob = { status: "running", outputs: [], error: null };
const completed: StudioJob = { status: "completed", outputs: ["new-out"], error: null };
const failed: StudioJob = { status: "failed", outputs: [], error: "boom" };

// Minimal renderHook. @testing-library/react is not a dependency of this
// package, so we mount a probe component with react-dom directly.
const mounted: { root: Root; container: HTMLElement }[] = [];

function renderHook<T>(useHookFn: () => T): { result: { current: T }; unmount: () => void } {
  const result = { current: undefined as unknown as T };
  function Probe() {
    result.current = useHookFn();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => {
    root.render(createElement(Probe));
  });
  return {
    result,
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  getStudioJob.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  vi.useRealTimers();
});

describe("errText", () => {
  it("returns message from a plain error object", () => {
    expect(errText({ message: "x" })).toBe("x");
  });

  it("returns message nested under body", () => {
    expect(errText({ body: { message: "y" } })).toBe("y");
  });

  it("returns Error.message", () => {
    expect(errText(new Error("z"))).toBe("z");
  });

  it("falls back for an empty object", () => {
    expect(errText({})).toBe("Something went wrong");
  });

  it("falls back for null", () => {
    expect(errText(null)).toBe("Something went wrong");
  });

  it("falls back when message is not a string", () => {
    expect(errText({ message: 42 })).toBe("Something went wrong");
  });
});

describe("useStudioJob", () => {
  it("submits, polls to completion, and fires onComplete once", async () => {
    getStudioJob.mockResolvedValueOnce(running).mockResolvedValueOnce(completed);
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudioJob(onComplete));

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "r1" }));
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.requestId).toBe("r1");
    expect(result.current.job).toEqual(running);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.job).toEqual(completed);
    expect(result.current.error).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(completed, "r1");
  });

  it("stops on failed job without firing onComplete", async () => {
    getStudioJob.mockResolvedValueOnce(failed);
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudioJob(onComplete));

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "r2" }));
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.job).toEqual(failed);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("surfaces submit rejection as error and clears busy", async () => {
    const { result } = renderHook(() => useStudioJob());

    await act(async () => {
      await result.current.run(() => Promise.reject({ message: "submit blew up" }));
    });
    expect(result.current.error).toBe("submit blew up");
    expect(result.current.busy).toBe(false);
    expect(getStudioJob).not.toHaveBeenCalled();
  });

  it("surfaces poll rejection as error and clears busy", async () => {
    getStudioJob.mockRejectedValueOnce(new Error("poll died"));
    const { result } = renderHook(() => useStudioJob());

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "r3" }));
    });
    expect(result.current.error).toBe("poll died");
    expect(result.current.busy).toBe(false);
  });

  it("bails after POLL_MAX with a timeout error", async () => {
    getStudioJob.mockResolvedValue(running);
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudioJob(onComplete));

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "r4" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * POLL_MAX);
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain("Timed out");
    expect(onComplete).not.toHaveBeenCalled();
    expect(getStudioJob).toHaveBeenCalledTimes(POLL_MAX);

    // Chain is dead: no further polls after the bail.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(getStudioJob).toHaveBeenCalledTimes(POLL_MAX);
  });

  it("stops polling after unmount", async () => {
    getStudioJob.mockResolvedValue(running);
    const { result, unmount } = renderHook(() => useStudioJob());

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "r5" }));
    });
    expect(getStudioJob).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(getStudioJob).toHaveBeenCalledTimes(1);
  });

  it("uses a custom fetchJob when provided", async () => {
    const fetchJob = vi.fn().mockResolvedValue(completed);
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudioJob(onComplete, fetchJob));

    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "custom-1" }));
    });
    expect(fetchJob).toHaveBeenCalledWith("custom-1");
    expect(getStudioJob).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(completed, "custom-1");
  });

  it("ignores a stale in-flight poll when a second run supersedes it", async () => {
    const oldCompleted: StudioJob = { status: "completed", outputs: ["old-out"], error: null };
    let resolveOld!: (j: StudioJob) => void;
    getStudioJob.mockImplementationOnce(
      () => new Promise<StudioJob>((res) => { resolveOld = res; }),
    );
    const onComplete = vi.fn();
    const { result } = renderHook(() => useStudioJob(onComplete));

    // First run: poll for "old" stays in flight.
    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "old" }));
    });
    expect(getStudioJob).toHaveBeenCalledWith("old");

    // Second run completes immediately.
    getStudioJob.mockResolvedValueOnce(completed);
    await act(async () => {
      await result.current.run(() => Promise.resolve({ request_id: "new" }));
    });
    expect(result.current.busy).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(completed, "new");

    // Old chain resolves late: must not fire onComplete, mutate state, or re-arm.
    await act(async () => {
      resolveOld(oldCompleted);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.job).toEqual(completed);
    expect(result.current.requestId).toBe("new");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(getStudioJob).toHaveBeenCalledTimes(2);
  });
});
