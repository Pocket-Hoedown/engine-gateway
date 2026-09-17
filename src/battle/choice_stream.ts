import { BattleStreams } from "@pkmn/sim";
import type { ConsumedSubmission } from "./request_guard.ts";

interface EmittedError {
  message: string;
  submission?: ConsumedSubmission;
}

/** Capture causality BEFORE asynchronous player-stream pumping. The pinned simulator
 * emits choice errors synchronously from _write; errors emitted outside that stack
 * are deliberately uncorrelated, never attributed to the most recent submission.
 */
export class ChoiceBattleStream extends BattleStreams.BattleStream {
  private active?: { player: string; submission: ConsumedSubmission };
  private readonly emittedErrors = new Map<string, EmittedError>();

  writeChoice(player: string, command: string, submission: ConsumedSubmission): void {
    this.active = { player, submission };
    try {
      this._write(`>${player} ${command}`);
    } finally {
      this.active = undefined;
    }
  }

  override pushMessage(type: string, data: string): void {
    if (type === "sideupdate") {
      const [player, ...lines] = data.split("\n");
      data = [
        player,
        ...lines.map((line) => {
          if (!line.startsWith("|error|")) return line;
          const message = line.slice(7);
          const submission =
            message.startsWith("[Invalid choice]") && this.active?.player === player
              ? this.active.submission
              : undefined;
          // A private, one-use envelope carries immutable emission evidence through
          // getPlayerStreams. It is removed before any public/domain event is emitted.
          const token = `gateway-error:${crypto.randomUUID()}`;
          this.emittedErrors.set(token, { message, submission });
          return `|error|${token}`;
        }),
      ].join("\n");
    }
    super.pushMessage(type, data);
  }

  takeError(message: string): EmittedError {
    const error = this.emittedErrors.get(message);
    this.emittedErrors.delete(message);
    return error ?? { message };
  }
}
