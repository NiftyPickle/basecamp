// Thin JSON-RPC client for the dashboard /api/ws gateway. The raw socket is
// injected via a factory so this is unit-testable without a real WebSocket.

export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((data: string) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = () => SocketLike;

/**
 * Standard browser WebSocket adapter for ChatSocket. Wraps a native
 * WebSocket in the SocketLike shape so pages don't hand-roll the same
 * adapter; tests inject their own factory instead.
 */
export function makeBrowserSocketFactory(url: string): SocketFactory {
  return () => {
    const ws = new WebSocket(url);
    const adapter: SocketLike = {
      onopen: null,
      onmessage: null,
      onclose: null,
      send: (d: string) => ws.send(d),
      close: () => ws.close(),
    };
    ws.onopen = () => adapter.onopen?.();
    ws.onclose = () => adapter.onclose?.();
    ws.onmessage = (e) => adapter.onmessage?.(typeof e.data === "string" ? e.data : "");
    return adapter;
  };
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class ChatSocket {
  private socket: SocketLike | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private eventCb: ((frame: unknown) => void) | null = null;
  private openCb: (() => void) | null = null;
  private closeCb: (() => void) | null = null;
  private readonly factory: SocketFactory;

  constructor(factory: SocketFactory) {
    this.factory = factory;
  }

  connect(): void {
    const s = this.factory();
    this.socket = s;
    s.onopen = () => this.openCb?.();
    s.onclose = () => this.closeCb?.();
    s.onmessage = (data: string) => this.handle(data);
  }

  onEvent(cb: (frame: unknown) => void): void { this.eventCb = cb; }
  onOpen(cb: () => void): void { this.openCb = cb; }
  onClose(cb: () => void): void { this.closeCb = cb; }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error("socket not connected"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private handle(data: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(data);
    } catch {
      return; // ignore non-JSON noise
    }
    if (!frame || typeof frame !== "object") return;
    const f = frame as Record<string, unknown>;

    if (f.method === "event") {
      this.eventCb?.(frame);
      return;
    }
    if (typeof f.id === "number" && this.pending.has(f.id)) {
      const p = this.pending.get(f.id)!;
      this.pending.delete(f.id);
      if (f.error && typeof f.error === "object") {
        const msg = (f.error as Record<string, unknown>).message;
        p.reject(new Error(typeof msg === "string" ? msg : "request failed"));
      } else {
        p.resolve(f.result);
      }
    }
  }
}
