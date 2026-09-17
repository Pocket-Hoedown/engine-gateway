import { BattleRequestError } from "./types.ts";

/** Enforces one submission per actionable controller request, with optional sim identity. */
export class PendingRequestGuard {
  private nextId = 0;
  private readonly pending = new Map<string, { id: number; rqid?: number }>();

  open(controllerId: string, rqid?: number): number {
    const id = ++this.nextId;
    this.pending.set(controllerId, { id, rqid });
    return id;
  }

  consume(controllerId: string, rqid?: number): number {
    const request = this.pending.get(controllerId);
    if (!request) throw new BattleRequestError("no pending request");
    if (request.rqid !== undefined && request.rqid !== rqid) {
      throw new BattleRequestError("stale request");
    }
    this.pending.delete(controllerId);
    return request.id;
  }

  clear(controllerId: string): void {
    this.pending.delete(controllerId);
  }
}
