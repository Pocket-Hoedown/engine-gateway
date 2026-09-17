import { BattleRequestError } from "./types.ts";

/** Enforces one submission per actionable controller request, with optional sim identity. */
export class PendingRequestGuard {
  private readonly pending = new Map<string, { rqid?: number; consumed: boolean }>();

  open(controllerId: string, rqid?: number): void {
    this.pending.set(controllerId, { rqid, consumed: false });
  }

  consume(controllerId: string, rqid?: number): void {
    const request = this.pending.get(controllerId);
    if (!request || request.consumed) throw new BattleRequestError("no pending request");
    if (request.rqid !== undefined && request.rqid !== rqid) {
      throw new BattleRequestError("stale request");
    }
    request.consumed = true;
  }

  /** An invalid simulator choice may retry only the still-consumed pending request. */
  reject(controllerId: string): void {
    const request = this.pending.get(controllerId);
    if (request?.consumed) request.consumed = false;
  }

  clear(controllerId: string): void {
    this.pending.delete(controllerId);
  }
}
