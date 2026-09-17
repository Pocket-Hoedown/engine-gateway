import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { PushQueue } from "../../src/battle/queue.ts";
import type { BattleEvent, Replay } from "../../src/battle/types.ts";
import { BattleHub, type BattleStore, type HubClock, type HubSocket } from "../../src/ws/hub.ts";
import {
  BattleFormat,
  ClientFrameSchema,
  FailureCode,
  PROTOCOL_VERSION,
  ServerFrameSchema,
  Side,
} from "../../src/ws/protocol.ts";

// Literal wire fields keep the command regression executable against the old schema.
function field(number: number, value: string | number[]): number[] {
  const bytes = typeof value === "string" ? [...new TextEncoder().encode(value)] : value;
  assert(bytes.length < 128);
  return [number * 8 + 2, bytes.length, ...bytes];
}

Deno.test("ValidateTeam returns legality errors without creating a battle", async () => {
  const store = new FakeStore();
  const socket = new FakeSocket();
  const hub = new BattleHub({ manager: store });
  hub.open(socket);
  await hub.receive(socket, hello());
  const member = [
    ...field(1, "Tauros"),
    ...field(2, "Intimidate"),
    ...field(3, "NotANature"),
    ...field(4, "Return"),
  ];
  const teamBytes = [...field(1, "phf-team/1"), ...field(2, "Illegal"), 24, 5, ...field(5, member)];
  const validate = [...field(1, "standard"), 16, 1, ...field(3, teamBytes)];
  await hub.receive(
    socket,
    new Uint8Array(field(3, [8, 1, ...field(2, "validate"), ...field(7, validate)])),
  );
  const output = decode(socket)[1].payload;
  assert(output.case === "message" && output.value.payload.case === "response");
  const result = output.value.payload.value.result as unknown as {
    case: string;
    value: { valid: boolean; errors: string[] };
  };
  assertEquals(result.case, "teamValidation");
  assertEquals(result.value.valid, false);
  assert(result.value.errors.length > 0);
  assertEquals(store.creates, 0);
  await hub.shutdown();
});

class FakeClock implements HubClock {
  private now = 0;
  private next = 1;
  private readonly timers = new Map<number, { due: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.next++;
    this.timers.set(id, { due: this.now + delayMs, callback });
    return id;
  }

  clearTimeout(timer: number): void {
    this.timers.delete(timer);
  }

  advance(ms: number): void {
    this.now += ms;
    while (true) {
      const due = [...this.timers.entries()].find(([, timer]) => timer.due <= this.now);
      if (!due) return;
      this.timers.delete(due[0]);
      due[1].callback();
    }
  }
}

class FakeSocket implements HubSocket {
  bufferedAmount = 0;
  readyState = 1;
  readonly sent: Uint8Array[] = [];
  closeCode: number | undefined;

  send(data: Uint8Array): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = 3;
  }
}

class FakeSession {
  readonly id: string;
  readonly seed: number;
  readonly queues = new Map<string, PushQueue<BattleEvent>>();
  readonly spectatorQueue = new PushQueue<BattleEvent>();
  readonly choices: Array<{ controller: string; choices: string[] }> = [];
  destroyed = false;

  constructor(id: string, seed: number) {
    this.id = id;
    this.seed = seed;
    this.queues.set("alice", new PushQueue());
    this.queues.set("bob", new PushQueue());
  }

  events(controllerId: string): AsyncIterable<BattleEvent> {
    return this.queues.get(controllerId) as PushQueue<BattleEvent>;
  }

  spectator(): AsyncIterable<BattleEvent> {
    return this.spectatorQueue;
  }

  submitChoice(controller: string, choices: string[]): void {
    this.choices.push({ controller, choices });
  }

  replay(): Replay {
    return { seed: this.seed, inputLog: [">start"] };
  }

  destroy(): void {
    this.destroyed = true;
    for (const queue of this.queues.values()) queue.close();
    this.spectatorQueue.close();
  }
}

class FakeStore implements BattleStore {
  readonly sessions = new Map<string, FakeSession>();
  creates = 0;
  ends: string[] = [];

  create(): never {
    const session = new FakeSession(`b${++this.creates}`, 9);
    this.sessions.set(session.id, session);
    return session as never;
  }

  get(id: string): never {
    return this.sessions.get(id) as never;
  }

  end(id: string): void {
    this.ends.push(id);
    const session = this.sessions.get(id);
    session?.destroy();
    this.sessions.delete(id);
  }
}

function team(name: string) {
  return {
    schema: "phf-team/1",
    name,
    gen: 5,
    members: [{ species: "Pikachu", ability: "Static", nature: "Timid", moves: ["Thunderbolt"] }],
  };
}

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

function createCommand(sequence = 1n): Uint8Array {
  return frame({
    case: "command",
    value: {
      sequence,
      requestId: `create-${sequence}`,
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

function ack(sequence: bigint): Uint8Array {
  return frame({ case: "ack", value: { sequence } });
}

function command(sequence: bigint, requestId: string, body: unknown): Uint8Array {
  return frame({ case: "command", value: { sequence, requestId, command: body } });
}

function decode(socket: FakeSocket) {
  return socket.sent.map((value) => fromBinary(ServerFrameSchema, value));
}

function token(socket: FakeSocket): string {
  const first = decode(socket)[0].payload;
  if (first.case !== "hello") throw new Error("missing hello");
  return first.value.resumeToken;
}

Deno.test("hub requires hello and sends a fresh resumable hello", async () => {
  const socket = new FakeSocket();
  const hub = new BattleHub({ token: () => "fresh-token" });
  hub.open(socket);
  await hub.receive(socket, hello());
  const output = decode(socket);
  assertEquals(output.length, 1);
  assertEquals(output[0].payload.case, "hello");
  assertEquals(output[0].payload.case === "hello" && output[0].payload.value, {
    $typeName: "pocket_hoedown.v1.ServerHello",
    protocolVersion: PROTOCOL_VERSION,
    resumeToken: "fresh-token",
    resumed: false,
    nextClientSequence: 1n,
    lastAckedServerSequence: 0n,
  });
});

Deno.test("hub creates once, responds before stream events, and ignores duplicate commands", async () => {
  const store = new FakeStore();
  const socket = new FakeSocket();
  const hub = new BattleHub({ manager: store, token: () => "token" });
  hub.open(socket);
  await hub.receive(socket, hello());
  await hub.receive(socket, createCommand());
  await hub.receive(socket, createCommand());
  assertEquals(store.creates, 1);
  const afterCreate = decode(socket);
  assertEquals(afterCreate.map((value) => value.payload.case), ["hello", "message"]);
  assertEquals(
    afterCreate[1].payload.case === "message" && afterCreate[1].payload.value.payload.case,
    "response",
  );
  store.sessions.get("b1")!.queues.get("alice")!.push({ kind: "error", message: "safe" });
  await Promise.resolve();
  await Promise.resolve();
  const output = decode(socket);
  assertEquals(output[2].payload.case, "message");
  assertEquals(
    output[2].payload.case === "message" && output[2].payload.value.payload.case,
    "battleEvent",
  );
});

Deno.test("hub releases ACKed output and replays only unacknowledged output after rotating a token", async () => {
  const store = new FakeStore();
  const clock = new FakeClock();
  const tokens = ["first", "second"];
  const socket = new FakeSocket();
  const hub = new BattleHub({ manager: store, clock, token: () => tokens.shift()! });
  hub.open(socket);
  await hub.receive(socket, hello());
  await hub.receive(socket, createCommand());
  await hub.receive(socket, ack(1n));
  store.sessions.get("b1")!.queues.get("alice")!.push({ kind: "error", message: "safe" });
  await Promise.resolve();
  await Promise.resolve();
  hub.disconnect(socket);

  const resumed = new FakeSocket();
  hub.open(resumed);
  await hub.receive(resumed, hello(token(socket)));
  const output = decode(resumed);
  assertEquals(output[0].payload.case, "hello");
  const resumedHello = output[0].payload.case === "hello" ? output[0].payload.value : undefined;
  assertEquals(resumedHello?.resumed, true);
  assertEquals(resumedHello?.resumeToken, "second");
  assertNotEquals(resumedHello?.resumeToken, "first");
  assertEquals(output.length, 2);
  assertEquals(
    output[1].payload.case === "message" && output[1].payload.value.sequence,
    2n,
  );
  clock.advance(60_000);
  assertEquals(store.ends, []);
});

Deno.test("hub destroys owned battles for gaps, expiry, and outbox overflow", async () => {
  const gapStore = new FakeStore();
  const gapSocket = new FakeSocket();
  const gapHub = new BattleHub({ manager: gapStore, token: () => "gap" });
  gapHub.open(gapSocket);
  await gapHub.receive(gapSocket, hello());
  await gapHub.receive(gapSocket, createCommand());
  await gapHub.receive(gapSocket, createCommand(3n));
  assertEquals(gapSocket.closeCode, 1002);
  assertEquals(gapStore.ends, ["b1"]);

  const expiryStore = new FakeStore();
  const expiryClock = new FakeClock();
  const expirySocket = new FakeSocket();
  const expiryHub = new BattleHub({
    manager: expiryStore,
    clock: expiryClock,
    token: () => "expiry",
  });
  expiryHub.open(expirySocket);
  await expiryHub.receive(expirySocket, hello());
  await expiryHub.receive(expirySocket, createCommand());
  expiryHub.disconnect(expirySocket);
  expiryClock.advance(59_999);
  assertEquals(expiryStore.ends, []);
  expiryClock.advance(1);
  assertEquals(expiryStore.ends, ["b1"]);

  const overflowStore = new FakeStore();
  const overflowSocket = new FakeSocket();
  const overflowHub = new BattleHub({
    manager: overflowStore,
    limits: { maxOutboxMessages: 1 },
    token: () => "overflow",
  });
  overflowHub.open(overflowSocket);
  await overflowHub.receive(overflowSocket, hello());
  await overflowHub.receive(overflowSocket, createCommand());
  overflowStore.sessions.get("b1")!.queues.get("alice")!.push({ kind: "error", message: "safe" });
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(overflowSocket.closeCode, 1008);
  assertEquals(overflowStore.ends, ["b1"]);
});

Deno.test("hub returns typed failures without ending unrelated battles", async () => {
  const store = new FakeStore();
  const socket = new FakeSocket();
  const hub = new BattleHub({ manager: store, token: () => "failure" });
  hub.open(socket);
  await hub.receive(socket, hello());
  await hub.receive(
    socket,
    frame({
      case: "command",
      value: {
        sequence: 1n,
        requestId: "missing",
        command: { case: "getReplay", value: { battleId: "not-owned" } },
      },
    }),
  );
  const output = decode(socket);
  const result =
    output[1].payload.case === "message" && output[1].payload.value.payload.case === "response"
      ? output[1].payload.value.payload.value.result
      : undefined;
  assertEquals(result?.case, "failure");
  assertEquals(result?.case === "failure" && result.value.code, FailureCode.NOT_FOUND);
  assertEquals(store.ends, []);
  assert(socket.closeCode === undefined);
});

Deno.test("hub pauses flushing under socket backpressure without dropping output", async () => {
  const clock = new FakeClock();
  const socket = new FakeSocket();
  socket.bufferedAmount = 1;
  const hub = new BattleHub({
    clock,
    limits: { sendHighWaterBytes: 0, flushRetryMs: 1 },
    token: () => "backpressure",
  });
  hub.open(socket);
  await hub.receive(socket, hello());
  await hub.receive(socket, createCommand());
  assertEquals(decode(socket).length, 1);
  socket.bufferedAmount = 0;
  clock.advance(1);
  const output = decode(socket);
  assertEquals(output.length, 2);
  assertEquals(output[1].payload.case, "message");
  assertEquals(output[1].payload.case === "message" && output[1].payload.value.sequence, 1n);
});

Deno.test("hub submits choices, snapshots replay, and explicitly ends owned battles", async () => {
  const store = new FakeStore();
  const socket = new FakeSocket();
  const hub = new BattleHub({ manager: store, token: () => "commands" });
  hub.open(socket);
  await hub.receive(socket, hello());
  await hub.receive(socket, createCommand());
  await hub.receive(
    socket,
    command(2n, "choice", {
      case: "submitChoice",
      value: { battleId: "b1", controllerId: "alice", choices: ["move 1"] },
    }),
  );
  await hub.receive(
    socket,
    command(3n, "replay", {
      case: "getReplay",
      value: { battleId: "b1" },
    }),
  );
  await hub.receive(
    socket,
    command(4n, "end", {
      case: "endBattle",
      value: { battleId: "b1" },
    }),
  );
  assertEquals(store.sessions.get("b1"), undefined);
  assertEquals(store.ends, ["b1"]);
  const results = decode(socket).slice(1).map((value) => {
    if (value.payload.case !== "message" || value.payload.value.payload.case !== "response") {
      throw new Error("expected command response");
    }
    return value.payload.value.payload.value.result.case;
  });
  assertEquals(results, ["battleCreated", "choiceAccepted", "replayResult", "battleEnded"]);
});

Deno.test("hub bounds queued inbound frames while an asynchronous handshake is pending", async () => {
  let resolveToken!: (value: string) => void;
  const token = new Promise<string>((resolve) => resolveToken = resolve);
  const socket = new FakeSocket();
  const hub = new BattleHub({
    limits: { maxPendingInboundMessages: 1 },
    token: () => token,
  });
  hub.open(socket);
  const first = hub.receive(socket, hello());
  await Promise.resolve();
  await hub.receive(socket, hello());
  assertEquals(socket.closeCode, 1002);
  resolveToken("unused");
  await first;
});

Deno.test("closing during resume handshake preserves the disconnected owner", async () => {
  const store = new FakeStore();
  const clock = new FakeClock();
  let resolveToken!: (value: string) => void;
  const delayed = new Promise<string>((resolve) => resolveToken = resolve);
  let issues = 0;
  const hub = new BattleHub({
    manager: store,
    clock,
    token: () => ++issues === 1 ? "first" : delayed,
  });
  const original = new FakeSocket();
  hub.open(original);
  await hub.receive(original, hello());
  await hub.receive(original, createCommand());
  hub.disconnect(original);

  const interrupted = new FakeSocket();
  hub.open(interrupted);
  const resume = hub.receive(interrupted, hello("first"));
  await Promise.resolve();
  hub.disconnect(interrupted);
  resolveToken("second");
  await resume;
  assertEquals(store.ends, []);

  const recovered = new FakeSocket();
  hub.open(recovered);
  await hub.receive(recovered, hello("first"));
  const recoveredHello = decode(recovered)[0].payload;
  assertEquals(recoveredHello.case, "hello");
  assertEquals(recoveredHello.case === "hello" && recoveredHello.value.resumed, true);
  clock.advance(60_000);
  assertEquals(store.ends, []);
});

Deno.test("shutdown closes sockets that have not completed a hello", async () => {
  const socket = new FakeSocket();
  const hub = new BattleHub();
  hub.open(socket);
  await hub.shutdown();
  assertEquals(socket.closeCode, 1001);
});
