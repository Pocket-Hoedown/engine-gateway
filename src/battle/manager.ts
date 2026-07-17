import { BattleSession } from "./session.ts";
import { BattleRequestError, type CreateBattleRequest } from "./types.ts";

let counter = 0;

function genSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function validate(req: CreateBattleRequest): void {
  if (req.format === "multi") {
    throw new BattleRequestError("format 'multi' is not supported until Phase 3a-multi");
  }
  if (!req.mode.battleFormats.includes(req.format)) {
    throw new BattleRequestError(`mode '${req.mode.id}' does not support format '${req.format}'`);
  }
  if (req.controllers.length !== 2) {
    throw new BattleRequestError(`expected exactly 2 controllers, got ${req.controllers.length}`);
  }
  const sides = new Set(req.controllers.map((c) => c.side));
  if (sides.size !== 2) throw new BattleRequestError("expected one controller on each side (0 and 1)");
  for (const c of req.controllers) {
    if (!c.team.members.length) throw new BattleRequestError(`controller '${c.id}' has an empty team`);
  }
}

/** In-memory store of live battle sessions, keyed by battleId. */
export class BattleManager {
  private readonly sessions = new Map<string, BattleSession>();

  get size(): number {
    return this.sessions.size;
  }

  create(req: CreateBattleRequest): BattleSession {
    validate(req);
    const seed = req.seed ?? genSeed();
    const id = `b${Date.now().toString(36)}_${counter++}`;
    const session = new BattleSession(id, req, seed);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): BattleSession | undefined {
    return this.sessions.get(id);
  }

  end(id: string): void {
    const s = this.sessions.get(id);
    if (s) {
      s.destroy();
      this.sessions.delete(id);
    }
  }
}
