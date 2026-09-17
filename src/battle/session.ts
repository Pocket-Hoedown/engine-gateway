import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { BattleStreams, Teams } from "@pkmn/sim";
import type { BattleFormat } from "../modes/types.ts";
import { buildBattleInputs } from "../modes/build.ts";
import { buildStartBlock, isTimestampLine, winnerFromLine } from "./protocol.ts";
import { parseRequest } from "./request.ts";
import { splitSideChunk } from "./chunk.ts";
import { spectatorSafeEvents, spectatorSafeLines, spectatorSafeState } from "./visibility.ts";
import { PendingRequestGuard } from "./request_guard.ts";
import { PushQueue } from "./queue.ts";
import type { BattleState } from "./state.ts";
import { StateTracker } from "./tracker.ts";
import {
  type BattleEvent,
  type BattleFrameDomain,
  BattleRequestError,
  type CreateBattleRequest,
  type Replay,
} from "./types.ts";

type SimPlayer = "p1" | "p2";
interface Binding {
  id: string;
  side: 0 | 1;
  simPlayer: SimPlayer;
}

export class BattleSession {
  readonly id: string;
  readonly seed: number;
  readonly format: BattleFormat;
  readonly ended: Promise<{ winner: string | null }>;

  private readonly battleStream: InstanceType<typeof BattleStreams.BattleStream>;
  private readonly streams: ReturnType<typeof BattleStreams.getPlayerStreams>;
  private readonly bindings = new Map<string, Binding>();
  private readonly byPlayer = new Map<SimPlayer, string>();
  private readonly queues = new Map<string, PushQueue<BattleEvent>>();
  private readonly spectatorQueue = new PushQueue<BattleEvent>();
  private readonly trackers = new Map<SimPlayer, StateTracker>();
  private readonly spectatorTracker: StateTracker;
  private readonly spectatorReadyPlayers = new Set<SimPlayer>();
  private readonly spectatorReady: Promise<void>;
  private readonly inputLog: string[] = [];
  private readonly pendingRequests = new PendingRequestGuard();
  private readonly closedPlayers = new Set<SimPlayer>();
  private spectatorSubscribed = false;
  private spectatorClosed = false;
  private latestSpectatorState: BattleState | undefined;
  private latestSpectatorFrame: BattleFrameDomain | undefined;
  private done = false;
  private result: string | null | undefined;
  private resolveEnded!: (o: { winner: string | null }) => void;
  private resolveSpectatorReady!: () => void;

  constructor(id: string, req: CreateBattleRequest, seed: number) {
    this.id = id;
    this.seed = seed;
    this.format = req.format;
    this.ended = new Promise((res) => (this.resolveEnded = res));
    this.spectatorReady = new Promise((res) => (this.resolveSpectatorReady = res));

    const side0 = req.controllers.find((c) => c.side === 0);
    const side1 = req.controllers.find((c) => c.side === 1);
    if (!side0 || !side1) {
      throw new BattleRequestError("need one controller on each side (0 and 1)");
    }
    for (const [c, simPlayer] of [[side0, "p1"], [side1, "p2"]] as const) {
      this.bindings.set(c.id, { id: c.id, side: c.side, simPlayer });
      this.byPlayer.set(simPlayer, c.id);
      this.queues.set(c.id, new PushQueue<BattleEvent>());
    }

    const inputs = buildBattleInputs(req.mode, req.format, [side0.team, side1.team], seed);
    const gens = new Generations(Dex);
    const gen = gens.get(5);
    const sets = inputs.packedTeams.map((team) =>
      (Teams.unpack(team) ?? []).map((set) => {
        const abilities = gen.species.get(set.species)?.abilities as
          | Record<string, string>
          | undefined;
        return abilities?.[set.ability] ? { ...set, ability: abilities[set.ability] } : set;
      })
    );
    const teams: [string[], string[]] = [
      sets[0].map((set) => set.species),
      sets[1].map((set) => set.species),
    ];
    const gameType = req.format === "single"
      ? "singles"
      : req.format === "double"
      ? "doubles"
      : "triples";
    this.trackers.set("p1", new StateTracker(0, gens, [sets[0], undefined]));
    this.trackers.set("p2", new StateTracker(1, gens, [undefined, sets[1]]));
    this.spectatorTracker = new StateTracker(null, gens);
    this.spectatorTracker.initialize(gameType, [[], []]);
    for (const tracker of this.trackers.values()) {
      tracker.initialize(gameType, teams);
    }

    this.battleStream = new BattleStreams.BattleStream();
    this.streams = BattleStreams.getPlayerStreams(this.battleStream);

    this.write(buildStartBlock(inputs.formatid, inputs.seed, inputs.packedTeams));
    void this.pumpSide("p1");
    void this.pumpSide("p2");
    void this.pumpSpectator();
  }

  private write(line: string): void {
    this.inputLog.push(line);
    void this.streams.omniscient.write(line);
  }

  submitChoice(controllerId: string, choices: string[], rqid?: number): void {
    const binding = this.bindings.get(controllerId);
    if (!binding) throw new BattleRequestError(`unknown controller: ${controllerId}`);
    if (this.done) throw new BattleRequestError("battle has ended");
    this.pendingRequests.consume(controllerId, rqid);
    this.write(`>${binding.simPlayer} ${choices.join(", ")}`);
  }

  events(controllerId: string): AsyncIterable<BattleEvent> {
    const queue = this.queues.get(controllerId);
    if (!queue) throw new BattleRequestError(`unknown controller: ${controllerId}`);
    return queue;
  }

  spectator(): AsyncIterable<BattleEvent> {
    return {
      [Symbol.asyncIterator]: () => {
        this.subscribeSpectator();
        return this.spectatorQueue[Symbol.asyncIterator]();
      },
    };
  }

  private subscribeSpectator(): void {
    if (this.spectatorSubscribed) return;
    this.spectatorSubscribed = true;
    if (this.latestSpectatorFrame) {
      this.spectatorQueue.push({ kind: "frame", frame: this.latestSpectatorFrame });
    } else if (this.latestSpectatorState) {
      this.spectatorQueue.push({
        kind: "frame",
        frame: {
          turn: this.latestSpectatorState.turn,
          phase: this.latestSpectatorState.phase,
          protocolLines: [],
          events: [],
          checkpoint: this.latestSpectatorState,
        },
      });
    }
    if (this.done) this.closeSpectator(this.result ?? null);
  }

  replay(): Replay {
    return { seed: this.seed, inputLog: [...this.inputLog] };
  }

  destroy(): void {
    if (!this.done) {
      for (const player of ["p1", "p2"] as const) {
        if (!this.closedPlayers.has(player)) {
          const endState = (this.trackers.get(player) as StateTracker).end();
          this.queueForPlayer(player).push({
            kind: "frame",
            frame: {
              turn: endState.turn,
              phase: endState.phase,
              protocolLines: [],
              events: [],
              checkpoint: endState,
            },
          });
        }
      }
      if (!this.spectatorClosed) {
        const endState = this.spectatorTracker.end();
        this.pushSpectatorFrame({
          turn: endState.turn,
          phase: endState.phase,
          protocolLines: [],
          events: [],
          checkpoint: endState,
        });
      }
      this.finishResult(null);
    }
    for (const player of ["p1", "p2"] as const) this.closePlayer(player, this.result ?? null);
    this.closeSpectator(this.result ?? null);
    try {
      void this.battleStream.destroy();
    } catch {
      // Ignored if battle stream has already naturally completed/closed
    }
  }

  private queueForPlayer(player: SimPlayer): PushQueue<BattleEvent> {
    return this.queues.get(this.byPlayer.get(player) as string) as PushQueue<BattleEvent>;
  }

  private markSpectatorReady(player: SimPlayer): void {
    this.spectatorReadyPlayers.add(player);
    if (this.spectatorReadyPlayers.size === 2) this.resolveSpectatorReady();
  }

  private pushSpectatorFrame(input: BattleFrameDomain): void {
    const frame: BattleFrameDomain = {
      turn: input.turn,
      phase: input.phase,
      protocolLines: spectatorSafeLines(input.protocolLines),
      events: spectatorSafeEvents(input.events),
      checkpoint: spectatorSafeState(input.checkpoint),
    };
    this.latestSpectatorFrame = frame;
    this.latestSpectatorState = frame.checkpoint;
    if (this.spectatorSubscribed) this.spectatorQueue.push({ kind: "frame", frame });
  }

  private pushNormalized(
    queue: PushQueue<BattleEvent>,
    tracker: StateTracker,
    lines: string[],
    renderLines: string[],
  ): void {
    if (!lines.length) return;
    const result = tracker.ingest(lines);
    queue.push({
      kind: "frame",
      frame: {
        turn: result.state.turn,
        phase: result.state.phase,
        protocolLines: renderLines,
        events: result.events,
        checkpoint: result.state,
      },
    });
  }

  private async pumpSide(player: SimPlayer): Promise<void> {
    const queue = this.queueForPlayer(player);
    const tracker = this.trackers.get(player) as StateTracker;
    for await (const chunk of this.streams[player]) {
      const parsed = splitSideChunk(chunk);
      const { terminal } = parsed;
      // Complete private ingestion before publishing the corresponding boundary.
      this.pushNormalized(queue, tracker, parsed.trackerLines, parsed.renderLines);
      if (parsed.requestJson) {
        const request = parseRequest(parsed.requestJson);
        const controllerId = this.byPlayer.get(player)!;
        if (request.wait) this.pendingRequests.clear(controllerId);
        else this.pendingRequests.open(controllerId, request.rqid);
        queue.push({ kind: "request", request });
        this.markSpectatorReady(player);
      }
      for (const message of parsed.errors) {
        if (message.startsWith("[Invalid choice]")) {
          this.pendingRequests.reject(this.byPlayer.get(player)!);
        }
        queue.push({ kind: "error", message });
      }
      if (terminal !== undefined) {
        this.closePlayer(player, terminal);
        return;
      }
    }
    if (!this.closedPlayers.has(player)) {
      const { winner } = await this.ended;
      const endState = tracker.end();
      queue.push({
        kind: "frame",
        frame: {
          turn: endState.turn,
          phase: endState.phase,
          protocolLines: [],
          events: [],
          checkpoint: endState,
        },
      });
      this.closePlayer(player, winner);
    }
  }

  private async pumpSpectator(): Promise<void> {
    for await (const chunk of this.streams.spectator) {
      const { renderLines, terminal } = splitSideChunk(chunk);
      const lines = spectatorSafeLines(renderLines);
      if (!lines.length) continue;
      await this.spectatorReady;
      const result = this.spectatorTracker.ingest(lines);
      const state = result.state;
      this.pushSpectatorFrame({
        turn: state.turn,
        phase: state.phase,
        protocolLines: lines,
        events: result.events,
        checkpoint: state,
      });
      if (terminal !== undefined) {
        this.finishResult(terminal);
        return;
      }
    }
    if (!this.done) {
      const endState = this.spectatorTracker.end();
      this.pushSpectatorFrame({
        turn: endState.turn,
        phase: endState.phase,
        protocolLines: [],
        events: [],
        checkpoint: endState,
      });
      this.finishResult(null);
    }
  }

  private closePlayer(player: SimPlayer, winner: string | null): void {
    if (this.closedPlayers.has(player)) return;
    this.closedPlayers.add(player);
    this.pendingRequests.clear(this.byPlayer.get(player)!);
    const queue = this.queueForPlayer(player);
    queue.push({ kind: "ended", winner });
    queue.close();
  }

  private closeSpectator(winner: string | null): void {
    if (this.spectatorClosed || !this.spectatorSubscribed) return;
    this.spectatorClosed = true;
    this.spectatorQueue.push({ kind: "ended", winner });
    this.spectatorQueue.close();
  }

  private finishResult(winner: string | null): void {
    if (this.done) return;
    this.done = true;
    this.result = winner;
    this.resolveSpectatorReady();
    this.closeSpectator(winner);
    this.resolveEnded({ winner });
  }
}

export async function reconstruct(
  replay: Replay,
): Promise<{ winner: string | null; log: string[] }> {
  const battleStream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(battleStream);

  for (const line of replay.inputLog) await streams.omniscient.write(line);

  const log: string[] = [];
  let winner: string | null = null;
  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split("\n")) {
      if (!line || isTimestampLine(line)) continue;
      log.push(line);
      const result = winnerFromLine(line);
      if (result !== null) winner = result;
    }
  }
  return { winner, log };
}
