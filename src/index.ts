import type { BattleResult } from "./battle/runner.ts";
import { runHeadlessBattle } from "./battle/runner.ts";
import type { BattleFormat, GameMode } from "./modes/types.ts";
import { buildBattleInputs } from "./modes/build.ts";
import type { PhfTeam } from "./teams/types.ts";

/** Build battle inputs from phf teams (assigning seeded IVs) and run to completion. */
export async function runMatch(
  mode: GameMode,
  format: BattleFormat,
  teams: [PhfTeam, PhfTeam],
  seed: number,
): Promise<BattleResult> {
  const inputs = buildBattleInputs(mode, format, teams, seed);
  return await runHeadlessBattle(inputs);
}

export { runHeadlessBattle } from "./battle/runner.ts";
export type { BattleResult, SimSeed } from "./battle/runner.ts";
export { buildBattleInputs } from "./modes/build.ts";
export { StandardMode } from "./modes/standard.ts";
export type { BattleFormat, BattleInputs, GameMode } from "./modes/types.ts";
export type { PhfMember, PhfTeam } from "./teams/types.ts";
