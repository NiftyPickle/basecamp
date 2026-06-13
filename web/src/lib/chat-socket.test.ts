import { describe, it, expect } from "vitest";
import { ChatSocket } from "./chat-socket";
import type { SocketLike } from "./chat-socket";

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.onclose?.(); }
  emit(obj: unknown) { this.onmessage?.(JSON.stringify(obj)); }
}

describe("ChatSocket", () => {
  it("sends a JSON-RPC request with an incrementing id and resolves on response", async () => {
    // Arrange
    const fake = new FakeSocket();
    const sock = new ChatSocket(() => fake);
    sock.connect();
    fake.onopen?.();
    // Act
    const p = sock.request("session.create", {});
    const req = JSON.parse(fake.sent[0]);
    fake.emit({ jsonrpc: "2.0", id: req.id, result: { session_id: "abc123" } });
    const result = await p;
    // Assert
    expect(req).toMatchObject({ jsonrpc: "2.0", method: "session.create", params: {} });
    expect(result).toEqual({ session_id: "abc123" });
  });

  it("rejects when the response carries an error", async () => {
    // Arrange
    const fake = new FakeSocket();
    const sock = new ChatSocket(() => fake);
    sock.connect();
    fake.onopen?.();
    // Act
    const p = sock.request("prompt.submit", { session_id: "x", text: "hi" });
    const req = JSON.parse(fake.sent[0]);
    fake.emit({ jsonrpc: "2.0", id: req.id, error: { code: 4009, message: "session busy" } });
    // Assert
    await expect(p).rejects.toThrow("session busy");
  });

  it("routes event frames to the onEvent callback", () => {
    // Arrange
    const fake = new FakeSocket();
    const sock = new ChatSocket(() => fake);
    const seen: unknown[] = [];
    sock.onEvent((f) => seen.push(f));
    sock.connect();
    fake.onopen?.();
    // Act
    fake.emit({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready" } });
    // Assert
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "event", params: { type: "gateway.ready" } });
  });
});
