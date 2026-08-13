import { toID } from "@pkmn/data";
import type { SpriteEntry } from "./manifest.ts";

/** One entry of Smogon's `data/species.json`. */
export interface SmogonSpecies {
  num: number;
  formeNum: number;
  base: string;
  forme: string;
  sid: string;
}

/** A single file to copy from the Smogon repo into the pack, renamed by id. */
export interface CopyOp {
  from: string; // e.g. "s15329-b-s.gif"
  to: string; // e.g. "rotomheat-b-s.gif"
}

// Fixed suffix order: back, female, shiny. All 8 combinations.
const SUFFIXES = ["", "-b", "-f", "-s", "-b-f", "-b-s", "-f-s", "-b-f-s"] as const;
const EXTS = ["gif", "png"] as const;

/**
 * Pure planner: intersect Smogon sprites with the gen(5) id set and enumerate every variant file
 * that actually exists on disk. Deterministic — no clock, no IO. `gen(5)` is the scope authority.
 */
export function planSpritePack(
  species: Record<string, SmogonSpecies>,
  genIds: Set<string>,
  files: Set<string>,
): { copies: CopyOp[]; sprites: Record<string, SpriteEntry> } {
  const copies: CopyOp[] = [];
  const sprites: Record<string, SpriteEntry> = {};

  for (const entry of Object.values(species)) {
    const id = toID(entry.base + entry.forme);
    if (!genIds.has(id)) continue;
    if (!files.has(`${entry.sid}.gif`) && !files.has(`${entry.sid}.png`)) continue; // no front → skip

    for (const suffix of SUFFIXES) {
      for (const ext of EXTS) {
        const from = `${entry.sid}${suffix}.${ext}`;
        if (files.has(from)) copies.push({ from, to: `${id}${suffix}.${ext}` });
      }
    }

    const has = (s: string) =>
      files.has(`${entry.sid}${s}.gif`) || files.has(`${entry.sid}${s}.png`);
    sprites[id] = { back: has("-b"), shiny: has("-s"), female: has("-f") };
  }

  return { copies, sprites };
}
