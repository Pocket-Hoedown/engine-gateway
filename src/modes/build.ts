import { Teams } from "@pkmn/sim";
import type { BattleFormat, BattleInputs, GameMode } from "./types.ts";
import type { PhfTeam } from "../teams/types.ts";
import { toPokemonSets } from "../teams/types.ts";
import { assignTeamIVs } from "../teams/ivs.ts";
import { simSeedFromInt } from "../teams/rng.ts";

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
    // offset team B's IV stream so the two sides never share an IV spread
    pack(t1, seed + 1000003),
  ];
  return {
    formatid: mode.compileFormatId(format),
    packedTeams,
    seed: simSeedFromInt(seed),
  };
}
