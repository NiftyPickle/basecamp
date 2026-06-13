import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FreeChatPage } from "./FreeChatPage";
import type { SocketFactory, SocketLike } from "@/lib/chat-socket";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FakeSocket = SocketLike & { sent: string[]; closed: boolean };

function makeFakeFactory(): { factory: SocketFactory; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = () => {
    const socket: FakeSocket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      sent: [],
      closed: false,
      send(data: string) {
        socket.sent.push(data);
      },
      close() {
        socket.closed = true;
      },
    };
    sockets.push(socket);
    return socket;
  };
  return { factory, sockets };
}

const INFO_WITH_KEY = {
  key_present: true,
  free_models: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
  ],
  council_available: true,
  council_default_models: ["anthropic/claude-sonnet-4.5"],
};

const LOCAL_INFO_DEFAULT = {
  available: true,
  detected_ram_gb: 16,
  free_disk_gb: 100,
  models: [
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
  ],
};

function mockInfoFetch(
  info: unknown = INFO_WITH_KEY,
  localInfo: unknown = LOCAL_INFO_DEFAULT,
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/local/models") ? localInfo : info;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(factory: SocketFactory): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(FreeChatPage, { socketFactory: factory }));
  });
}

function unmount(): void {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
}

function setDraft(value: string): void {
  const textarea = container.querySelector("textarea");
  expect(textarea).not.toBeNull();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(textarea, value);
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitDraft(): Promise<void> {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function respond(socket: FakeSocket, sentIndex: number, body: Record<string, unknown>): Promise<void> {
  const req = JSON.parse(socket.sent[sentIndex]) as { id: number };
  await act(async () => {
    socket.onmessage?.(JSON.stringify({ jsonrpc: "2.0", id: req.id, ...body }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  mockInfoFetch();
  localStorage.clear();
});

afterEach(() => {
  unmount();
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FreeChatPage socket lifecycle", () => {
  test("reconnects with backoff after the socket closes", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    expect(sockets).toHaveLength(1);

    await act(async () => {
      sockets[0].onopen?.();
    });
    await act(async () => {
      sockets[0].onclose?.();
    });

    // first backoff step is 500ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(sockets).toHaveLength(2);

    // a second drop reconnects again at the doubled backoff
    await act(async () => {
      sockets[1].onclose?.();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(sockets).toHaveLength(3);
  });

  test("unmount cancels pending reconnect and closes the socket", async () => {
    vi.useFakeTimers();
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    expect(sockets).toHaveLength(1);

    await act(async () => {
      sockets[0].onclose?.();
    });
    unmount();
    expect(sockets[0].closed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(sockets).toHaveLength(1);
  });
});

describe("FreeChatPage send flow", () => {
  test("prompt.submit rejection surfaces an error bubble", async () => {
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    setDraft("hello council");
    await submitDraft();

    // session.create request goes out first; grant it
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({ method: "session.create" });
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    // prompt.submit carries session, text, and the council flag
    const submitFrame = JSON.parse(sockets[0].sent[1]) as { method: string; params: Record<string, unknown> };
    expect(submitFrame.method).toBe("prompt.submit");
    expect(submitFrame.params).toMatchObject({ session_id: "s1", text: "hello council", council: false });

    // reject it -> error bubble rendered
    await respond(sockets[0], 1, { error: { message: "boom" } });
    expect(container.textContent).toContain("Failed to send");
  });

  test("restores the draft when session creation fails", async () => {
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    setDraft("keep me");
    await submitDraft();
    await respond(sockets[0], 0, { error: { message: "no session" } });

    expect(container.textContent).toContain("Could not start a session");
    const textarea = container.querySelector("textarea");
    expect(textarea?.value).toBe("keep me");
  });
});

describe("FreeChatPage local models", () => {
  test("keyless with local available renders chat, not the onboarding gate", async () => {
    const { factory } = makeFakeFactory();
    mockInfoFetch({ ...INFO_WITH_KEY, key_present: false });
    await mount(factory);
    expect(
      container.querySelector("[data-testid='free-chat-input']"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid='model-picker']"),
    ).not.toBeNull();
  });

  test("keyless without local support still shows the onboarding gate", async () => {
    const { factory } = makeFakeFactory();
    mockInfoFetch(
      { ...INFO_WITH_KEY, key_present: false },
      { available: false, detected_ram_gb: 0, free_disk_gb: 0, models: [] },
    );
    await mount(factory);
    expect(
      container.querySelector("[data-testid='free-chat-input']"),
    ).toBeNull();
  });

  test("installed local model submits with the local/ ref", async () => {
    const localInfo = {
      ...LOCAL_INFO_DEFAULT,
      models: [
        { ...LOCAL_INFO_DEFAULT.models[0], state: "installed", progress: 1 },
      ],
    };
    const { factory, sockets } = makeFakeFactory();
    mockInfoFetch({ ...INFO_WITH_KEY, key_present: false }, localInfo);
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    setDraft("hi local");
    await submitDraft();
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    const submitFrame = JSON.parse(sockets[0].sent[1]) as {
      params: Record<string, unknown>;
    };
    expect(submitFrame.params.models).toEqual([
      "local/qwen2.5-7b-instruct-q4",
    ]);
  });

  test("download sentinel opens the panel and starts polling", async () => {
    vi.useFakeTimers();
    const { factory } = makeFakeFactory();
    const spy = mockInfoFetch();
    await mount(factory);

    const picker = container.querySelector<HTMLSelectElement>(
      "[data-testid='model-picker']",
    )!;
    act(() => {
      picker.value = "__download__";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-testid='download-row']"),
    ).not.toBeNull();

    const before = spy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/local/models"),
    ).length;
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    const after = spy.mock.calls.filter((c) =>
      String(c[0]).includes("/api/local/models"),
    ).length;
    expect(after).toBeGreaterThan(before);
    vi.useRealTimers();
  });
});

describe("FreeChatPage model selection", () => {
  test("prompt.submit carries the default selected model when council is off", async () => {
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    setDraft("hi");
    await submitDraft();
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    const submitFrame = JSON.parse(sockets[0].sent[1]) as { params: Record<string, unknown> };
    expect(submitFrame.params.models).toEqual(["meta-llama/llama-3.3-70b-instruct:free"]);
  });

  test("changing the picker persists to localStorage and changes the submit param", async () => {
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    const select = container.querySelector<HTMLSelectElement>("[data-testid='model-picker']");
    expect(select).not.toBeNull();
    act(() => {
      select!.value = "nvidia/nemotron-3-super-120b-a12b:free";
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(localStorage.getItem("hermes.freechat.model")).toBe(
      "nvidia/nemotron-3-super-120b-a12b:free",
    );

    setDraft("hi nemotron");
    await submitDraft();
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    const submitFrame = JSON.parse(sockets[0].sent[1]) as { params: Record<string, unknown> };
    expect(submitFrame.params.models).toEqual(["nvidia/nemotron-3-super-120b-a12b:free"]);
  });

  test("a stored model no longer in free_models falls back to the first listed", async () => {
    localStorage.setItem("hermes.freechat.model", "gone/rotated-away:free");
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    setDraft("hi");
    await submitDraft();
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    const submitFrame = JSON.parse(sockets[0].sent[1]) as { params: Record<string, unknown> };
    expect(submitFrame.params.models).toEqual(["meta-llama/llama-3.3-70b-instruct:free"]);
  });

  test("council submits carry no models param", async () => {
    const { factory, sockets } = makeFakeFactory();
    await mount(factory);
    await act(async () => {
      sockets[0].onopen?.();
    });

    const councilToggle = container.querySelector<HTMLButtonElement>("button[role='switch']");
    expect(councilToggle).not.toBeNull();
    act(() => {
      councilToggle!.click();
    });

    setDraft("council question");
    await submitDraft();
    await respond(sockets[0], 0, { result: { session_id: "s1" } });

    const submitFrame = JSON.parse(sockets[0].sent[1]) as { params: Record<string, unknown> };
    expect(submitFrame.params.council).toBe(true);
    expect("models" in submitFrame.params).toBe(false);
  });
});
