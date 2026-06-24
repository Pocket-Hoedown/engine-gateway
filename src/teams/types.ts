import type { PokemonSet, StatsTable } from "@pkmn/sim";

export interface PhfMember {
  species: string;
  ability: string;
  nature: string;
  moves: string[];
  item?: string;
  level?: number;
  gender?: "M" | "F" | "N";
  shiny?: boolean;
  happiness?: number;
  hpType?: string;
  evs?: Partial<StatsTable>;
}

export interface PhfTeam {
  schema: "phf-team/1";
  name: string;
  gen: 5;
  tags?: string[];
  members: PhfMember[];
}

const ZERO_EVS: StatsTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** Convert a phf envelope to Showdown sets. IVs are intentionally left unset
 *  (assigned per-match by assignTeamIVs). */
export function toPokemonSets(team: PhfTeam): PokemonSet[] {
  return team.members.map((m) => {
    const set = {
      name: m.species,
      species: m.species,
      item: m.item ?? "",
      ability: m.ability,
      moves: [...m.moves],
      nature: m.nature,
      gender: m.gender ?? "",
      evs: { ...ZERO_EVS, ...m.evs },
      level: m.level ?? 100,
      shiny: m.shiny ?? false,
      happiness: m.happiness ?? 255,
    } as PokemonSet;
    if (m.hpType) set.hpType = m.hpType;
    return set;
  });
}
