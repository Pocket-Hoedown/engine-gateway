import { TeamValidator } from "@pkmn/sim";
import type { BattleFormat, GameMode } from "../modes/types.ts";
import type { PhfTeam } from "./types.ts";
import { toPokemonSets } from "./types.ts";
import { runClauses } from "./clauses.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const SIM_FORMAT_IDS: Record<BattleFormat, string> = {
  single: "gen5customgame",
  double: "gen5doublescustomgame",
  triple: "gen5triplescustomgame",
  multi: "gen5customgame", // ponytail: multi has no dedicated custom-game id yet (see StandardMode); good enough for legality checks
};

/**
 * Two-tier team validation:
 *  Tier 1 — gateway/mode rules: the mode's clause list + its own validateTeam (if any).
 *  Tier 2 — sim legality: @pkmn/sim's TeamValidator (movepool, abilities, items, forme legality).
 */
export function validateTeam(
  team: PhfTeam,
  mode: GameMode,
  format: BattleFormat = "single",
  modeConfig?: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (mode.clauses) errors.push(...runClauses(mode.clauses, team));
  if (mode.validateTeam) errors.push(...mode.validateTeam(team, modeConfig));

  const validator = new TeamValidator(SIM_FORMAT_IDS[format]);
  const simErrors = validator.validateTeam(toPokemonSets(team));
  if (simErrors) errors.push(...simErrors);

  return { valid: errors.length === 0, errors };
}
