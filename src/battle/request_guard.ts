import { BattleRequestError } from "./types.ts";

/** Object identity binds a submission to one request incarnation, even without rqid. */
export interface ConsumedSubmission {
  readonly choiceId?: string;
  readonly rqid?: number;
}

export class PendingRequestGuard {
  private readonly pending = new Map<string, { rqid?: number; consumed?: ConsumedSubmission }>();

  open(controllerId: string, rqid?: number): void {
    this.pending.set(controllerId, { rqid });
  }

  consume(controllerId: string, rqid?: number, choiceId?: string): ConsumedSubmission {
    const request = this.pending.get(controllerId);
    if (!request || request.consumed) throw new BattleRequestError("no pending request");
    if (request.rqid !== undefined && request.rqid !== rqid) {
      throw new BattleRequestError("stale request");
    }
    const submission = Object.freeze({ choiceId, rqid: request.rqid });
    request.consumed = submission;
    return submission;
  }

  /** Only evidence captured at the synchronous simulator write boundary may reopen. */
  reject(controllerId: string, submission?: ConsumedSubmission): void {
    const request = this.pending.get(controllerId);
    if (submission && request?.consumed === submission) request.consumed = undefined;
  }

  clear(controllerId: string): void {
    this.pending.delete(controllerId);
  }
}
