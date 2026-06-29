import { gen } from "./gen.ts";

/**
 * Full legal Gen-5 movepool for display / move-picker population: the union of a
 * species' learnset with those of every pre-evolution, as sorted unique move ids.
 * Authoritative legality is the sim TeamValidator's job (Phase 4); this is for display.
 */
export async function legalMovepool(speciesId: string): Promise<string[]> {
  const moves = new Set<string>();
  let current = gen.species.get(speciesId);
  while (current) {
    const ls = await gen.learnsets.get(current.id);
    if (ls?.learnset) {
      for (const moveid of Object.keys(ls.learnset)) moves.add(moveid);
    }
    current = current.prevo ? gen.species.get(current.prevo) : undefined;
  }
  return [...moves].sort();
}
