import type { SimSeed } from "../battle/runner.ts";
import type { Clause } from "../teams/clauses.ts";
import type { PhfTeam } from "../teams/types.ts";
import type { z } from "zod";

export type BattleFormat = "single" | "double" | "triple" | "multi";

export interface GameMode {
  id: string;
  name: string;
  description?: string;
  battleFormats: BattleFormat[];
  /** Compile a battle format to the Gen-5 sim format id used to start the battle. */
  compileFormatId(format: BattleFormat): string;
  /** Clause primitives always run against teams for this mode. */
  clauses?: Clause[];
  /** Runtime + wire schema for this mode's config (derivePool/validateTeam's `config` arg).
   *  Also the source of the JSON Schema exposed at GET /modes/:id/schema. */
  configSchema?: z.ZodTypeAny;
  /** Mode-specific team rules beyond the clause list (e.g. Gym Leader's type restriction). */
  validateTeam?(team: PhfTeam, config?: unknown): string[];
  /** Modes that generate a draft pool (e.g. Gym Leader) implement this. Throws a ZodError
   *  (via configSchema) for a config that fails validation. */
  derivePool?(config: unknown): string[];
}

export interface BattleInputs {
  formatid: string;
  packedTeams: [string, string];
  seed: SimSeed;
}
