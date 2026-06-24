import type { SimSeed } from "../battle/runner.ts";

export type BattleFormat = "single" | "double" | "triple" | "multi";

export interface GameMode {
  id: string;
  name: string;
  battleFormats: BattleFormat[];
  /** Compile a battle format to the Gen-5 sim format id used to start the battle. */
  compileFormatId(format: BattleFormat): string;
}

export interface BattleInputs {
  formatid: string;
  packedTeams: [string, string];
  seed: SimSeed;
}
