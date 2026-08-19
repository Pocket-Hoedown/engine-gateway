import { z } from "zod";
import type { GameMode } from "./types.ts";
import type { PhfTeam } from "../teams/types.ts";
import { abilityClause, itemClause, runClauses, speciesClause } from "../teams/clauses.ts";
import { gen } from "../dex/gen.ts";

const FORMAT_IDS: Record<"single" | "double" | "triple", string> = {
  single: "gen5customgame",
  double: "gen5doublescustomgame",
  triple: "gen5triplescustomgame",
};

/** Arceus's type-changing plates, Gen 5 (no Fairy plate; Normal needs none — it's Arceus's base type). */
const ARCEUS_PLATES: Record<string, string> = {
  Fighting: "Fist Plate",
  Flying: "Sky Plate",
  Poison: "Toxic Plate",
  Ground: "Earth Plate",
  Rock: "Stone Plate",
  Bug: "Insect Plate",
  Ghost: "Spooky Plate",
  Steel: "Iron Plate",
  Fire: "Flame Plate",
  Water: "Splash Plate",
  Grass: "Meadow Plate",
  Electric: "Zap Plate",
  Psychic: "Mind Plate",
  Ice: "Icicle Plate",
  Dragon: "Draco Plate",
  Dark: "Dread Plate",
};

const LEGENDARY_TAGS = new Set(["Mythical", "Restricted Legendary", "Sub-Legendary"]);

function isLegendaryOrMythical(speciesId: string): boolean {
  const s = gen.species.get(speciesId);
  if (!s) return false;
  // Arceus's own formes are tagged Mythical too, but they're the *fallback*
  // (base Normal-type Arceus + a Plate), not a native per-type Legendary/Mythical.
  if (s.baseSpecies === "Arceus") return false;
  return s.tags.some((t) => LEGENDARY_TAGS.has(t));
}

export const GymLeaderConfigSchema = z.object({
  /** The type this player's gym is built around, e.g. "Electric". */
  type: z.string(),
  /** Species ids excluded from the draft pool (blind simultaneous bans). */
  bans: z.array(z.string()).optional(),
});
export type GymLeaderConfig = z.infer<typeof GymLeaderConfigSchema>;

/** The Gen-5 species of `type`, excluding Legendaries/Mythicals (those are the free
 *  gym-leader mon, not draft picks) and any banned species. Used to seed the snake draft. */
export function derivePool(config: GymLeaderConfig): string[] {
  const bans = new Set((config.bans ?? []).map((b) => gen.species.get(b)?.id ?? b));
  const pool: string[] = [];
  for (const s of gen.species) {
    if (!s.types.includes(config.type as never)) continue;
    if (isLegendaryOrMythical(s.id)) continue;
    if (bans.has(s.id)) continue;
    pool.push(s.id);
  }
  return pool.sort();
}

/** The free Legendary/Mythical of `type` for this gym leader, or Arceus + the matching
 *  plate as a fallback for types with no native Gen-5 Legendary/Mythical. */
export function legendaryFor(type: string): { species: string; item?: string } {
  for (const s of gen.species) {
    if (!isLegendaryOrMythical(s.id)) continue;
    if (s.types.includes(type as never)) return { species: s.name };
  }
  const plate = ARCEUS_PLATES[type];
  if (!plate && type !== "Normal") {
    throw new Error(`No Legendary/Mythical or Arceus Plate for type: ${type}`);
  }
  return plate ? { species: "Arceus", item: plate } : { species: "Arceus" };
}

function validateGymLeaderTeam(team: PhfTeam, config: unknown): string[] {
  const errors = runClauses([speciesClause, itemClause, abilityClause], team);
  const parsed = GymLeaderConfigSchema.safeParse(config);
  if (!parsed.success) {
    errors.push(`Gym Leader Clause: invalid config — ${z.prettifyError(parsed.error)}`);
    return errors;
  }
  const cfg = parsed.data;

  let legendaryCount = 0;
  for (const m of team.members) {
    const species = gen.species.get(m.species);
    if (!species) {
      errors.push(`Gym Leader Clause: unknown species ${m.species}`);
      continue;
    }
    const isFreeLegendary = species.baseSpecies === "Arceus" || isLegendaryOrMythical(species.id);
    if (isFreeLegendary) {
      legendaryCount++;
      continue;
    }
    if (!species.types.includes(cfg.type as never)) {
      errors.push(
        `Gym Leader Clause: ${m.species} is not ${cfg.type}-type (gym leader is ${cfg.type})`,
      );
    }
  }
  if (legendaryCount > 1) {
    errors.push(`Gym Leader Clause: team has ${legendaryCount} Legendary/Mythical (max 1)`);
  }
  return errors;
}

export const GymLeaderMode: GameMode = {
  id: "gym-leader",
  name: "Gym Leader",
  description:
    "Each player is assigned a type, drafts 5 same-type Pokémon via snake draft, and gets a " +
    "free matching Legendary/Mythical (or Arceus + Plate).",
  battleFormats: ["single", "double", "triple"],
  clauses: [speciesClause, itemClause, abilityClause],
  configSchema: GymLeaderConfigSchema,
  validateTeam: validateGymLeaderTeam,
  derivePool: (config: unknown) => derivePool(GymLeaderConfigSchema.parse(config)),
  compileFormatId(format) {
    if (format === "multi") throw new Error("Battle format 'multi' is not supported");
    return FORMAT_IDS[format as "single" | "double" | "triple"];
  },
};
