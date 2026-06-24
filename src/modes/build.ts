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
  const [t0, t1] = teams;
  const pack = (t: PhfTeam, ivSeed: number): string => {
    const sets = toPokemonSets(t);
    assignTeamIVs(sets, t.members, ivSeed);
    return Teams.pack(sets);
  };
  const packedTeams: [string, string] = [
    pack(t0, seed),
    pack(t1, seed + 1000003),
  ];
  return {
    formatid: mode.compileFormatId(format),
    packedTeams,
    seed: simSeedFromInt(seed),
  };
}
