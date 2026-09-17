import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { BattleManager } from "../battle/manager.ts";
import { BattleSession } from "../battle/session.ts";
import { type BattleEvent, BattleRequestError } from "../battle/types.ts";
import { type BattleAudience, encodeBattleEvent } from "./battle_event.ts";
import { decodeCreateBattle, decodeValidateTeam } from "./decode.ts";
import { validateTeam } from "../teams/validator.ts";
import { TeamValidationResultSchema } from "./protocol.ts";
import { encodeReplay, encodeUnexpectedFailure } from "./encode.ts";
import {
  BattleCreatedSchema,
  BattleEndedSchema,
  ChoiceAcceptedSchema,
  type ClientCommand,
  ClientFrameSchema,
  type CommandResponse,
  CommandResponseSchema,
  FailureCode,
  PROTOCOL_VERSION,
  type SequencedServerMessage,
  ServerFrameSchema,
} from "./protocol.ts";
import { WireAdapterError } from "./validation.ts";

const DEFAULT_LIMITS: HubLimits = {
  disconnectTtlMs: 60_000,
  helloTimeoutMs: 5_000,
  maxInboundBytes: 1024 * 1024,
  maxPendingInboundMessages: 64,
  maxPendingInboundBytes: 4 * 1024 * 1024,
  maxOutboxMessages: 4096,
  maxOutboxBytes: 16 * 1024 * 1024,
  sendHighWaterBytes: 256 * 1024,
  flushRetryMs: 25,
};

export interface HubLimits {
  disconnectTtlMs: number;
  helloTimeoutMs: number;
  maxInboundBytes: number;
  maxPendingInboundMessages: number;
  maxPendingInboundBytes: number;
  maxOutboxMessages: number;
  maxOutboxBytes: number;
  sendHighWaterBytes: number;
  flushRetryMs: number;
}

export interface HubClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timer: number): void;
}

export interface HubSocket {
  readonly bufferedAmount: number;
  readonly readyState: number;
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}

export interface BattleStore {
  create(request: Parameters<BattleManager["create"]>[0]): BattleSession;
  get(id: string): BattleSession | undefined;
  end(id: string): void;
}

export interface BattleHubOptions {
  manager?: BattleStore;
  limits?: Partial<HubLimits>;
  clock?: HubClock;
  token?: () => string | Promise<string>;
  log?: (message: string) => void;
}

type OwnerState = "connected" | "disconnected" | "terminal";

interface OutboxEntry {
  sequence: bigint;
  bytes: Uint8Array;
}

interface Pump {
  active: boolean;
  done: Promise<void>;
}

interface OwnedBattle {
  session: BattleSession;
  controllers: Map<string, 0 | 1>;
  pumps: Pump[];
}

interface Owner {
  state: OwnerState;
  tokenHash: string;
  battles: Map<string, OwnedBattle>;
  lastClientSequence: bigint;
  nextServerSequence: bigint;
  lastAckedSequence: bigint;
  highestSentSequence: bigint;
  outbox: OutboxEntry[];
  outboxBytes: number;
  socket?: Attachment;
  expiryTimer?: number;
}

interface Attachment {
  socket: HubSocket;
  generation: number;
  sendCursor: bigint;
  owner?: Owner;
  helloTimer?: number;
  flushTimer?: number;
  receiving: Promise<void>;
  pendingInboundMessages: number;
  pendingInboundBytes: number;
  closed: boolean;
}

function clock(): HubClock {
  return {
    setTimeout(callback, delayMs) {
      return setTimeout(callback, delayMs) as unknown as number;
    },
    clearTimeout(timer) {
      clearTimeout(timer);
    },
  };
}

function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Promise.resolve(base64Url(bytes));
}

function errorCode(error: unknown): "INVALID_ARGUMENT" | "FAILED_PRECONDITION" | "INTERNAL" {
  if (error instanceof WireAdapterError) return "INVALID_ARGUMENT";
  if (error instanceof BattleRequestError) return "FAILED_PRECONDITION";
  return "INTERNAL";
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof WireAdapterError || error instanceof BattleRequestError) {
    return error.message;
  }
  return "internal error";
}

export class BattleHub {
  readonly limits: HubLimits;
  private readonly manager: BattleStore;
  private readonly currentClock: HubClock;
  private readonly createToken: () => string | Promise<string>;
  private readonly log: (message: string) => void;
  private readonly ownersByToken = new Map<string, Owner>();
  private readonly attachments = new Map<HubSocket, Attachment>();
  private nextAttachmentGeneration = 1;

  constructor(options: BattleHubOptions = {}) {
    this.manager = options.manager ?? new BattleManager();
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.currentClock = options.clock ?? clock();
    this.createToken = options.token ?? randomToken;
    this.log = options.log ?? (() => {});
  }

  open(socket: HubSocket): void {
    const attachment: Attachment = {
      socket,
      generation: this.nextAttachmentGeneration++,
      sendCursor: 0n,
      receiving: Promise.resolve(),
      pendingInboundMessages: 0,
      pendingInboundBytes: 0,
      closed: false,
    };
    attachment.helloTimer = this.currentClock.setTimeout(() => {
      if (!attachment.owner && !attachment.closed) {
        this.closeAttachment(attachment, 1002, "hello required");
      }
    }, this.limits.helloTimeoutMs);
    this.attachments.set(socket, attachment);
  }

  receive(socket: HubSocket, bytes: Uint8Array): Promise<void> {
    const attachment = this.attachments.get(socket);
    if (!attachment || attachment.closed) return Promise.resolve();
    attachment.pendingInboundMessages++;
    attachment.pendingInboundBytes += bytes.byteLength;
    if (
      attachment.pendingInboundMessages > this.limits.maxPendingInboundMessages ||
      attachment.pendingInboundBytes > this.limits.maxPendingInboundBytes
    ) {
      this.protocolFailure(attachment, "too many pending frames");
      return Promise.resolve();
    }
    attachment.receiving = attachment.receiving.then(async () => {
      try {
        if (attachment.closed) return;
        if (bytes.byteLength > this.limits.maxInboundBytes) {
          this.protocolFailure(attachment, "frame too large");
          return;
        }
        let frame: ReturnType<typeof fromBinary<typeof ClientFrameSchema>>;
        try {
          frame = fromBinary(ClientFrameSchema, bytes);
        } catch {
          this.protocolFailure(attachment, "malformed frame");
          return;
        }
        if (!attachment.owner) {
          if (frame.payload.case !== "hello") {
            this.protocolFailure(attachment, "hello required");
            return;
          }
          await this.hello(
            attachment,
            frame.payload.value.protocolVersion,
            frame.payload.value.resumeToken,
          );
          return;
        }
        if (frame.payload.case === "ack") {
          this.acknowledge(attachment.owner, frame.payload.value.sequence);
          return;
        }
        if (frame.payload.case === "command") {
          await this.command(attachment.owner, frame.payload.value);
          return;
        }
        this.protocolFailure(attachment, "unexpected frame");
      } finally {
        attachment.pendingInboundMessages--;
        attachment.pendingInboundBytes -= bytes.byteLength;
      }
    }).catch(() => this.protocolFailure(attachment, "transport failure"));
    return attachment.receiving;
  }

  disconnect(socket: HubSocket): void {
    const attachment = this.attachments.get(socket);
    if (!attachment) return;
    this.detach(attachment);
  }

  reject(socket: HubSocket, reason: string): void {
    const attachment = this.attachments.get(socket);
    if (attachment) this.protocolFailure(attachment, reason);
  }

  async shutdown(): Promise<void> {
    for (const attachment of [...this.attachments.values()]) {
      this.closeAttachment(attachment, 1001, "server shutdown");
    }
    const owners = new Set(this.ownersByToken.values());
    const pumps = [...owners].flatMap((owner) =>
      [...owner.battles.values()].flatMap((battle) => battle.pumps.map((pump) => pump.done))
    );
    for (const owner of owners) this.fatal(owner, 1001, "server shutdown");
    await Promise.allSettled(pumps);
  }

  private async hello(
    attachment: Attachment,
    version: string,
    resumeToken: string | undefined,
  ): Promise<void> {
    if (version !== PROTOCOL_VERSION) {
      await this.protocolFailure(attachment, "protocol version mismatch");
      return;
    }
    let owner: Owner;
    let resumed = false;
    if (resumeToken !== undefined) {
      const existing = this.ownersByToken.get(await hash(resumeToken));
      if (!this.isActiveAttachment(attachment)) return;
      if (!existing || existing.state !== "disconnected" || existing.socket) {
        this.protocolFailure(attachment, "invalid resume token");
        return;
      }
      owner = existing;
      resumed = true;
    } else {
      owner = {
        state: "connected",
        tokenHash: "",
        battles: new Map(),
        lastClientSequence: 0n,
        nextServerSequence: 1n,
        lastAckedSequence: 0n,
        highestSentSequence: 0n,
        outbox: [],
        outboxBytes: 0,
      };
    }
    const rawToken = await this.createToken();
    if (!this.isActiveAttachment(attachment)) return;
    const tokenHash = await hash(rawToken);
    if (!this.isActiveAttachment(attachment)) return;
    if (resumed && (owner.state !== "disconnected" || owner.socket)) return;
    if (resumed) {
      if (owner.expiryTimer !== undefined) this.currentClock.clearTimeout(owner.expiryTimer);
      this.ownersByToken.delete(owner.tokenHash);
    }
    owner.tokenHash = tokenHash;
    this.ownersByToken.set(owner.tokenHash, owner);
    owner.state = "connected";
    owner.socket = attachment;
    attachment.owner = owner;
    attachment.sendCursor = owner.lastAckedSequence;
    if (attachment.helloTimer !== undefined) this.currentClock.clearTimeout(attachment.helloTimer);
    try {
      this.send(
        attachment,
        toBinary(
          ServerFrameSchema,
          create(ServerFrameSchema, {
            payload: {
              case: "hello",
              value: {
                protocolVersion: PROTOCOL_VERSION,
                resumeToken: rawToken,
                resumed,
                nextClientSequence: owner.lastClientSequence + 1n,
                lastAckedServerSequence: owner.lastAckedSequence,
              },
            },
          }),
        ),
      );
    } catch {
      this.detach(attachment);
      return;
    }
    this.flush(owner);
  }

  private acknowledge(owner: Owner, sequence: bigint): void {
    if (sequence <= owner.lastAckedSequence) return;
    if (sequence > owner.highestSentSequence) {
      this.fatal(owner, 1002, "invalid acknowledgement");
      return;
    }
    owner.lastAckedSequence = sequence;
    while (owner.outbox[0]?.sequence <= sequence) {
      owner.outboxBytes -= owner.outbox.shift()!.bytes.byteLength;
    }
  }

  private async command(owner: Owner, command: ClientCommand): Promise<void> {
    const expected = owner.lastClientSequence + 1n;
    if (command.sequence <= owner.lastClientSequence) return;
    if (command.sequence !== expected) {
      this.fatal(owner, 1002, "invalid command sequence");
      return;
    }
    owner.lastClientSequence = command.sequence;
    try {
      switch (command.command.case) {
        case "validateTeam": {
          const { mode, format, team } = decodeValidateTeam(command.command.value);
          const result = validateTeam(team, mode, format);
          this.enqueueResponse(owner, command.requestId, {
            case: "teamValidation",
            value: create(TeamValidationResultSchema, {
              valid: result.valid,
              errors: [...result.errors],
            }),
          });
          return;
        }
        case "createBattle":
          await this.createBattle(owner, command.requestId, command.command.value);
          return;
        case "submitChoice":
          await this.submitChoice(owner, command.requestId, command.command.value);
          return;
        case "endBattle":
          await this.endBattle(owner, command.requestId, command.command.value.battleId);
          return;
        case "getReplay":
          await this.getReplay(owner, command.requestId, command.command.value.battleId);
          return;
        case undefined:
          throw new WireAdapterError(FailureCode.INVALID_ARGUMENT, "command is required");
      }
    } catch (error) {
      if (owner.state === "terminal") return;
      if (!(error instanceof WireAdapterError) && !(error instanceof BattleRequestError)) {
        this.log("unexpected battle command failure");
      }
      this.enqueueResponse(owner, command.requestId, {
        case: "failure",
        value: encodeUnexpectedFailure(
          error instanceof WireAdapterError
            ? error
            : error instanceof BattleRequestError
            ? new WireAdapterError(
              errorCode(error) === "FAILED_PRECONDITION"
                ? FailureCode.FAILED_PRECONDITION
                : FailureCode.INTERNAL,
              safeErrorMessage(error),
            )
            : error,
        ),
      });
    }
  }

  private createBattle(
    owner: Owner,
    requestId: string,
    value: Extract<ClientCommand["command"], { case: "createBattle" }>["value"],
  ): void {
    const request = decodeCreateBattle(value);
    const session = this.manager.create(request);
    const battle: OwnedBattle = {
      session,
      controllers: new Map(
        request.controllers.map((controller) => [controller.id, controller.side]),
      ),
      pumps: [],
    };
    owner.battles.set(session.id, battle);
    this.enqueueResponse(owner, requestId, {
      case: "battleCreated",
      value: create(BattleCreatedSchema, { battleId: session.id, seed: session.seed }),
    });
    for (const [controllerId, side] of battle.controllers) {
      battle.pumps.push(this.startPump(owner, battle, session.events(controllerId), {
        audience: "controller",
        controllerId,
        side,
      }));
    }
    const spectator = session.spectator()[Symbol.asyncIterator]();
    battle.pumps.push(this.startPump(owner, battle, spectator, { audience: "spectator" }));
  }

  private submitChoice(
    owner: Owner,
    requestId: string,
    value: Extract<ClientCommand["command"], { case: "submitChoice" }>["value"],
  ): void {
    const battle = this.ownedBattle(owner, value.battleId);
    if (!battle.controllers.has(value.controllerId)) {
      throw new BattleRequestError("unknown controller");
    }
    battle.session.submitChoice(value.controllerId, [...value.choices], value.rqid);
    this.enqueueResponse(owner, requestId, {
      case: "choiceAccepted",
      value: create(ChoiceAcceptedSchema, {
        battleId: value.battleId,
        controllerId: value.controllerId,
      }),
    });
  }

  private getReplay(owner: Owner, requestId: string, battleId: string): void {
    const battle = this.ownedBattle(owner, battleId);
    this.enqueueResponse(owner, requestId, {
      case: "replayResult",
      value: encodeReplay(battleId, battle.session.replay()),
    });
  }

  private endBattle(owner: Owner, requestId: string, battleId: string): void {
    const battle = this.ownedBattle(owner, battleId);
    for (const pump of battle.pumps) pump.active = false;
    owner.battles.delete(battleId);
    this.manager.end(battleId);
    this.enqueueResponse(owner, requestId, {
      case: "battleEnded",
      value: create(BattleEndedSchema, { battleId }),
    });
  }

  private ownedBattle(owner: Owner, battleId: string): OwnedBattle {
    const battle = owner.battles.get(battleId);
    if (!battle) throw new WireAdapterError(FailureCode.NOT_FOUND, "battle not found");
    return battle;
  }

  private startPump(
    owner: Owner,
    battle: OwnedBattle,
    iterable: AsyncIterable<BattleEvent> | AsyncIterator<BattleEvent>,
    audience: BattleAudience,
  ): Pump {
    const iterator = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable;
    const pump: Pump = { active: true, done: Promise.resolve() };
    pump.done = (async () => {
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) return;
          if (!pump.active || owner.state === "terminal" || !owner.battles.has(battle.session.id)) {
            continue;
          }
          this.enqueueBattleEvent(owner, battle.session.id, audience, next.value);
        }
      } catch {
        if (pump.active && owner.state !== "terminal" && owner.battles.has(battle.session.id)) {
          this.log("battle event pump failed");
          this.enqueueBattleEvent(owner, battle.session.id, audience, {
            kind: "error",
            message: "battle stream failed",
          });
          if (!owner.battles.has(battle.session.id)) return;
          for (const current of battle.pumps) current.active = false;
          owner.battles.delete(battle.session.id);
          this.manager.end(battle.session.id);
        }
      }
    })();
    return pump;
  }

  private enqueueResponse(
    owner: Owner,
    requestId: string,
    result: CommandResponse["result"],
  ): void {
    this.enqueue(owner, {
      case: "response",
      value: create(CommandResponseSchema, { requestId, result }),
    });
  }

  private enqueueBattleEvent(
    owner: Owner,
    battleId: string,
    audience: BattleAudience,
    event: BattleEvent,
  ): void {
    this.enqueue(owner, {
      case: "battleEvent",
      value: encodeBattleEvent(battleId, audience, event),
    });
  }

  private enqueue(
    owner: Owner,
    payload: SequencedServerMessage["payload"],
  ): void {
    if (owner.state === "terminal") return;
    const sequence = owner.nextServerSequence;
    const bytes = toBinary(
      ServerFrameSchema,
      create(ServerFrameSchema, {
        payload: {
          case: "message",
          value: { sequence, payload: payload as never },
        },
      }),
    );
    if (
      owner.outbox.length + 1 > this.limits.maxOutboxMessages ||
      owner.outboxBytes + bytes.byteLength > this.limits.maxOutboxBytes
    ) {
      this.fatal(owner, 1008, "outbox capacity exceeded");
      return;
    }
    owner.outbox.push({ sequence, bytes });
    owner.outboxBytes += bytes.byteLength;
    owner.nextServerSequence++;
    this.flush(owner);
  }

  private flush(owner: Owner): void {
    const attachment = owner.socket;
    if (!attachment || attachment.closed || attachment.socket.readyState !== 1) return;
    if (attachment.flushTimer !== undefined) {
      this.currentClock.clearTimeout(attachment.flushTimer);
      attachment.flushTimer = undefined;
    }
    while (
      owner.socket === attachment && !attachment.closed && attachment.socket.readyState === 1
    ) {
      if (attachment.socket.bufferedAmount > this.limits.sendHighWaterBytes) {
        attachment.flushTimer = this.currentClock.setTimeout(() => {
          attachment.flushTimer = undefined;
          this.flush(owner);
        }, this.limits.flushRetryMs);
        return;
      }
      const sequence = attachment.sendCursor + 1n;
      const entry = owner.outbox.find((candidate) => candidate.sequence === sequence);
      if (!entry) return;
      try {
        this.send(attachment, entry.bytes);
      } catch {
        this.detach(attachment);
        return;
      }
      attachment.sendCursor = entry.sequence;
      if (entry.sequence > owner.highestSentSequence) owner.highestSentSequence = entry.sequence;
    }
  }

  private send(attachment: Attachment, bytes: Uint8Array): void {
    if (attachment.closed || attachment.socket.readyState !== 1) throw new Error("socket closed");
    attachment.socket.send(bytes);
  }

  private isActiveAttachment(attachment: Attachment): boolean {
    return !attachment.closed && attachment.socket.readyState === 1 &&
      this.attachments.get(attachment.socket) === attachment;
  }

  private detach(attachment: Attachment): void {
    if (attachment.closed) return;
    attachment.closed = true;
    this.attachments.delete(attachment.socket);
    if (attachment.helloTimer !== undefined) this.currentClock.clearTimeout(attachment.helloTimer);
    if (attachment.flushTimer !== undefined) this.currentClock.clearTimeout(attachment.flushTimer);
    const owner = attachment.owner;
    if (!owner || owner.socket !== attachment || owner.state === "terminal") return;
    owner.socket = undefined;
    owner.state = "disconnected";
    owner.expiryTimer = this.currentClock.setTimeout(
      () => this.fatal(owner, 1001, "resume expired"),
      this.limits.disconnectTtlMs,
    );
  }

  private closeAttachment(attachment: Attachment, code: number, reason: string): void {
    if (!attachment.closed) {
      try {
        attachment.socket.close(code, reason);
      } catch {
        // A closed browser socket can reject close(), but cleanup still must proceed.
      }
    }
    this.detach(attachment);
  }

  private protocolFailure(attachment: Attachment, reason: string): void {
    if (attachment.owner) this.fatal(attachment.owner, 1002, reason);
    else this.closeAttachment(attachment, 1002, reason);
  }

  private fatal(owner: Owner, code: number, reason: string): void {
    if (owner.state === "terminal") return;
    owner.state = "terminal";
    this.ownersByToken.delete(owner.tokenHash);
    owner.tokenHash = "";
    if (owner.expiryTimer !== undefined) this.currentClock.clearTimeout(owner.expiryTimer);
    const attachment = owner.socket;
    owner.socket = undefined;
    if (attachment) this.closeAttachment(attachment, code, reason);
    const battles = [...owner.battles.entries()];
    owner.battles.clear();
    for (const [, battle] of battles) for (const pump of battle.pumps) pump.active = false;
    for (const [id] of battles) this.manager.end(id);
    owner.outbox.length = 0;
    owner.outboxBytes = 0;
  }
}
