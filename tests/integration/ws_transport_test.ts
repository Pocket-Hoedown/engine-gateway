import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { assertEquals } from "@std/assert";
import WebSocket from "npm:ws@8.18.3";
import { createApp } from "../../src/http/app.ts";
import { BattleHub } from "../../src/ws/hub.ts";
import {
  BattleFormat,
  ClientFrameSchema,
  PROTOCOL_VERSION,
  ServerFrameSchema,
  Side,
} from "../../src/ws/protocol.ts";

const host = "127" + ".0.0.1";

function frame(payload: unknown): Uint8Array {
  return toBinary(ClientFrameSchema, create(ClientFrameSchema, { payload: payload as never }));
}

function hello(token?: string): Uint8Array {
  return frame({
    case: "hello",
    value: {
      protocolVersion: PROTOCOL_VERSION,
      ...(token === undefined ? {} : { resumeToken: token }),
    },
  });
}

function createBattle(): Uint8Array {
  const team = (name: string) => ({
    schema: "phf-team/1",
    name,
    gen: 5,
    members: [{ species: "Pikachu", ability: "Static", nature: "Timid", moves: ["Thunderbolt"] }],
  });
  return frame({
    case: "command",
    value: {
      sequence: 1n,
      requestId: "create",
      command: {
        case: "createBattle",
        value: {
          modeId: "standard",
          format: BattleFormat.SINGLE,
          controllers: [
            { id: "alice", side: Side.ZERO, team: team("Alice") },
            { id: "bob", side: Side.ONE, team: team("Bob") },
          ],
        },
      },
    },
  });
}

function waitFor<T>(register: (finish: (value: T) => void) => void, ms = 3_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for WebSocket event")), ms);
    register((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function open(url: string, token: string): Promise<WebSocket> {
  const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
  return waitFor((finish) => socket.once("open", () => finish(socket)));
}

function message(socket: WebSocket): Promise<Uint8Array> {
  return waitFor((finish) =>
    socket.once("message", (data: Uint8Array) => finish(new Uint8Array(data)))
  );
}

function close(socket: WebSocket): Promise<number> {
  return waitFor((finish) => socket.once("close", (code: number) => finish(code)));
}

Deno.test("battle WebSocket rejects missing bearer token before upgrade", async () => {
  const hub = new BattleHub();
  const app = createApp({ battleHub: hub, gatewayToken: "correct-token" });
  const server = Deno.serve({ hostname: host, port: 0 }, app.fetch);
  const { port } = server.addr as Deno.NetAddr;
  try {
    for (const header of [undefined, "Bearer wrong-token"]) {
      const response = await fetch(`http://${host}:${port}/ws/battles`, {
        headers: header ? { Authorization: header } : undefined,
      });
      assertEquals(response.status, 401);
      assertEquals((await response.json()).error.code, "unauthorized");
    }
  } finally {
    await hub.shutdown();
    await server.shutdown();
  }
});

Deno.test("battle WebSocket handshakes, creates before streams, and resumes with rotation", async () => {
  const hub = new BattleHub();
  const app = createApp({ battleHub: hub, gatewayToken: "correct-token" });
  const server = Deno.serve({ hostname: host, port: 0 }, app.fetch);
  const { port } = server.addr as Deno.NetAddr;
  const url = `ws://${host}:${port}/ws/battles`;
  let first: WebSocket | undefined;
  let resumed: WebSocket | undefined;
  try {
    first = await open(url, "correct-token");
    first.send(hello());
    const initial = fromBinary(ServerFrameSchema, await message(first));
    assertEquals(initial.payload.case, "hello");
    const firstHello = initial.payload.case === "hello" ? initial.payload.value : undefined;
    assertEquals(firstHello?.protocolVersion, PROTOCOL_VERSION);
    assertEquals(firstHello?.resumed, false);

    first.send(createBattle());
    const created = fromBinary(ServerFrameSchema, await message(first));
    assertEquals(created.payload.case, "message");
    assertEquals(
      created.payload.case === "message" && created.payload.value.payload.case,
      "response",
    );
    assertEquals(
      created.payload.case === "message" && created.payload.value.payload.case === "response" &&
        created.payload.value.payload.value.result.case,
      "battleCreated",
    );

    const firstClosed = close(first);
    first.close();
    await firstClosed;
    resumed = await open(url, "correct-token");
    resumed.send(hello(firstHello?.resumeToken));
    const resumedFrame = fromBinary(ServerFrameSchema, await message(resumed));
    assertEquals(resumedFrame.payload.case, "hello");
    const resumedHello = resumedFrame.payload.case === "hello"
      ? resumedFrame.payload.value
      : undefined;
    assertEquals(resumedHello?.resumed, true);
    assertEquals(resumedHello?.nextClientSequence, 2n);
    if (!firstHello || !resumedHello || firstHello.resumeToken === resumedHello.resumeToken) {
      throw new Error("resume token did not rotate");
    }
  } finally {
    if (first && first.readyState < WebSocket.CLOSING) first.close();
    if (resumed && resumed.readyState < WebSocket.CLOSING) resumed.close();
    await hub.shutdown();
    await server.shutdown();
  }
});
