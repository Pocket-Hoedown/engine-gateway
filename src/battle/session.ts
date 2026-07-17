import { BattleStreams } from "@pkmn/sim";
import type { BattleFormat } from "../modes/types.ts";
import { buildBattleInputs } from "../modes/build.ts";
import { buildStartBlock, isTieLine, isTimestampLine, winnerFromLine } from "./protocol.ts";
import { parseRequest } from "./request.ts";
import { PushQueue } from "./queue.ts";
import {
  type BattleEvent,
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

/** An interactive, in-process battle: drive it with submitChoice; read per-side event streams. */
export class BattleSession {
  readonly id: string;
  readonly seed: number;
  readonly format: BattleFormat;
  readonly ended: Promise<{ winner: string | null }>;

  private readonly battleStream: InstanceType<typeof BattleStreams.BattleStream>;
  private readonly streams: ReturnType<typeof BattleStreams.getPlayerStreams>;
  private readonly bindings = new Map<string, Binding>(); // controllerId -> binding
  private readonly byPlayer = new Map<SimPlayer, string>(); // simPlayer -> controllerId
  private readonly queues = new Map<string, PushQueue<BattleEvent>>();
  private readonly spectatorQueue = new PushQueue<BattleEvent>();
  private readonly inputLog: string[] = [];
  private done = false;
  private resolveEnded!: (o: { winner: string | null }) => void;

  constructor(id: string, req: CreateBattleRequest, seed: number) {
    this.id = id;
    this.seed = seed;
    this.format = req.format;
    this.ended = new Promise((res) => (this.resolveEnded = res));

    const side0 = req.controllers.find((c) => c.side === 0);
    const side1 = req.controllers.find((c) => c.side === 1);
    if (!side0 || !side1) throw new BattleRequestError("need one controller on each side (0 and 1)");
    for (const [c, simPlayer] of [[side0, "p1"], [side1, "p2"]] as const) {
      this.bindings.set(c.id, { id: c.id, side: c.side, simPlayer });
      this.byPlayer.set(simPlayer, c.id);
      this.queues.set(c.id, new PushQueue<BattleEvent>());
    }

    const inputs = buildBattleInputs(req.mode, req.format, [side0.team, side1.team], seed);
    this.battleStream = new BattleStreams.BattleStream();
    this.streams = BattleStreams.getPlayerStreams(this.battleStream);

    // Write the start block first; the sim buffers output until the pumps read it. (Attaching a
    // reader to the omniscient duplex *before* the first write ends its read side prematurely.)
    this.write(buildStartBlock(inputs.formatid, inputs.seed, inputs.packedTeams));
    void this.pumpSide("p1");
    void this.pumpSide("p2");
    void this.pumpOmniscient();
  }

  private write(line: string): void {
    this.inputLog.push(line);
    void this.streams.omniscient.write(line);
  }

  submitChoice(controllerId: string, choices: string[]): void {
    const b = this.bindings.get(controllerId);
    if (!b) throw new BattleRequestError(`unknown controller: ${controllerId}`);
    if (this.done) throw new BattleRequestError("battle has ended");
    this.write(`>${b.simPlayer} ${choices.join(", ")}`);
  }

  events(controllerId: string): AsyncIterable<BattleEvent> {
    const q = this.queues.get(controllerId);
    if (!q) throw new BattleRequestError(`unknown controller: ${controllerId}`);
    return q;
  }

  spectator(): AsyncIterable<BattleEvent> {
    return this.spectatorQueue;
  }

  replay(): Replay {
    return { seed: this.seed, inputLog: [...this.inputLog] };
  }

  destroy(): void {
    if (!this.done) this.finish(null);
    void this.battleStream.destroy();
  }

  private queueForPlayer(p: SimPlayer): PushQueue<BattleEvent> {
    return this.queues.get(this.byPlayer.get(p) as string) as PushQueue<BattleEvent>;
  }

  private async pumpSide(player: SimPlayer): Promise<void> {
    const q = this.queueForPlayer(player);
    for await (const chunk of this.streams[player]) {
      const proto: string[] = [];
      for (const line of chunk.split("\n")) {
        if (!line || isTimestampLine(line)) continue;
        if (line.startsWith("|request|")) {
          const json = line.slice("|request|".length);
          if (json) q.push({ kind: "request", request: parseRequest(json) });
        } else if (line.startsWith("|error|")) {
          q.push({ kind: "error", message: line.slice("|error|".length) });
        } else {
          proto.push(line);
        }
      }
      if (proto.length) q.push({ kind: "protocol", lines: proto });
    }
  }

  private async pumpOmniscient(): Promise<void> {
    for await (const chunk of this.streams.omniscient) {
      const proto: string[] = [];
      for (const line of chunk.split("\n")) {
        if (!line || isTimestampLine(line)) continue;
        proto.push(line);
        const w = winnerFromLine(line);
        if (w !== null) {
          this.spectatorQueue.push({ kind: "protocol", lines: proto.splice(0) });
          this.finish(w);
        } else if (isTieLine(line)) {
          this.spectatorQueue.push({ kind: "protocol", lines: proto.splice(0) });
          this.finish(null);
        }
      }
      if (proto.length) this.spectatorQueue.push({ kind: "protocol", lines: proto });
    }
    if (!this.done) this.finish(null);
  }

  private finish(winner: string | null): void {
    if (this.done) return;
    this.done = true;
    const ended: BattleEvent = { kind: "ended", winner };
    for (const q of this.queues.values()) {
      q.push(ended);
      q.close();
    }
    this.spectatorQueue.push(ended);
    this.spectatorQueue.close();
    this.resolveEnded({ winner });
  }
}
