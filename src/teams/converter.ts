import { Teams } from "@pkmn/sim";
import type { PokemonSet } from "@pkmn/sim";
import type { PhfMember, PhfTeam } from "./types.ts";
import { toPokemonSets } from "./types.ts";

/** Convert Showdown sets (from import/unpack) into our PHF envelope.
 *  IVs are intentionally dropped — the gateway assigns them per-match. */
function fromPokemonSets(sets: PokemonSet[], name: string): PhfTeam {
  const members: PhfMember[] = sets.map((s) => ({
    species: s.species,
    ability: s.ability,
    nature: s.nature,
    moves: [...s.moves],
    ...(s.item ? { item: s.item } : {}),
    ...(s.level !== undefined ? { level: s.level } : {}),
    ...(s.gender ? { gender: s.gender as "M" | "F" | "N" } : {}),
    ...(s.shiny !== undefined ? { shiny: s.shiny } : {}),
    ...(s.happiness !== undefined ? { happiness: s.happiness } : {}),
    ...(s.hpType ? { hpType: s.hpType } : {}),
    ...(s.evs ? { evs: { ...s.evs } } : {}),
  }));
  return { schema: "phf-team/1", name, gen: 5, members };
}

/** Parse Showdown's human-readable export/import text format into a PHF team. */
export function parseShowdownText(text: string, name = "Imported Team"): PhfTeam {
  const sets = Teams.import(text);
  if (!sets) throw new Error("Could not parse Showdown team text");
  return fromPokemonSets(sets, name);
}

/** Render a PHF team as Showdown's human-readable export/import text format. */
export function toShowdownText(team: PhfTeam): string {
  return Teams.export(toPokemonSets(team));
}

/** Parse Showdown's compact packed team string into a PHF team. */
export function parseShowdownPacked(packed: string, name = "Imported Team"): PhfTeam {
  const sets = Teams.unpack(packed);
  if (!sets) throw new Error("Could not parse Showdown packed team");
  return fromPokemonSets(sets, name);
}

/** Render a PHF team as Showdown's compact packed team string. */
export function toShowdownPacked(team: PhfTeam): string {
  return Teams.pack(toPokemonSets(team));
}
