import { Teams } from "@pkmn/sim";
import type { BattleFormat, BattleInputs, GameMode } from "./types.ts";
import type { PhfTeam } from "../teams/types.ts";
import { toPokemonSets } from "../teams/types.ts";
import { assignTeamIVs, simSeedFromInt } from "../teams/ivs_exports.ts";

/** Build everything the battle runner needs: per-match IVs are assigned here
 *  (seeded), baked into the packed team strings. */
export function buildBattleInputs(
  mode: GameMode,
  format: BattleFormat,
  teams: [PhfTeam, PhfTeam],
  seed: number,
): BattleInputs {
  const packed = teams.map((team, idx) => {
    const sets = toPokemonSets(team);
    // Offset each side's IV seed so the two teams don't get identical spreads.
    assignTeamIVs(sets, team.members, seed + idx * 1000003);
    return Teams.pack(sets);
  }) as [string, string];

  return {
    formatid: mode.compileFormatId(format),
    packedTeams: packed,
    seed: simSeedFromInt(seed),
  };
}
