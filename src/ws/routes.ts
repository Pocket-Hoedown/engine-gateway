import type { Hono } from "@hono/hono";
import { hasBearerToken } from "./auth.ts";
import { BattleHub } from "./hub.ts";

export interface WebSocketUpgrade {
  response: Response;
  socket: WebSocket;
}

export type WebSocketUpgrader = (request: Request) => WebSocketUpgrade;

async function bytes(data: unknown, maximum: number): Promise<Uint8Array | undefined> {
  if (data instanceof ArrayBuffer) {
    return data.byteLength <= maximum ? new Uint8Array(data) : undefined;
  }
  if (ArrayBuffer.isView(data)) {
    return data.byteLength <= maximum
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : undefined;
  }
  if (data instanceof Blob) {
    return data.size <= maximum ? new Uint8Array(await data.arrayBuffer()) : undefined;
  }
  return undefined;
}

export function registerBattleWebSocketRoute(
  app: Hono,
  hub: BattleHub,
  token: string,
  upgrade: WebSocketUpgrader = Deno.upgradeWebSocket,
): void {
  app.get("/ws/battles", async (c) => {
    if (!await hasBearerToken(c.req.header("Authorization"), token)) {
      return c.json({ error: { code: "unauthorized", message: "unauthorized" } }, 401);
    }
    const { response, socket } = upgrade(c.req.raw);
    socket.binaryType = "arraybuffer";
    hub.open(socket);
    socket.onmessage = (event) => {
      void bytes(event.data, hub.limits.maxInboundBytes).then((frame) => {
        if (!frame) {
          hub.reject(socket, "binary frame required");
          return;
        }
        void hub.receive(socket, frame);
      }).catch(() => hub.reject(socket, "malformed frame"));
    };
    socket.onclose = () => hub.disconnect(socket);
    socket.onerror = () => hub.disconnect(socket);
    return response;
  });
}
