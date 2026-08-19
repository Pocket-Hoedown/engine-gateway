import { toID } from "@pkmn/data";
import type { PhfTeam } from "./types.ts";
import { gen } from "../dex/gen.ts";

/** A clause primitive: pure function from a team to a list of violation messages (empty = ok). */
export type Clause = (team: PhfTeam) => string[];

function baseSpeciesId(species: string): string {
  const s = gen.species.get(species);
  return s?.baseSpecies ? toID(s.baseSpecies) : toID(species);
}

function duplicateClause(
  label: string,
  keyOf: (species: string, member: PhfTeam["members"][number]) => string | undefined,
): Clause {
  return (team) => {
    const seen = new Map<string, number>();
    for (const m of team.members) {
      const key = keyOf(m.species, m);
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const errors: string[] = [];
    for (const [key, count] of seen) {
      if (count > 1) errors.push(`${label}: ${key} appears ${count} times (max 1)`);
    }
    return errors;
  };
}

/** Max 1 of each base species (formes of the same species count together). */
export const speciesClause: Clause = duplicateClause(
  "Species Clause",
  (species) => baseSpeciesId(species),
);

/** Max 1 of each held item across the team (no item is unrestricted). */
export const itemClause: Clause = duplicateClause(
  "Item Clause",
  (_species, m) => (m.item ? toID(m.item) : undefined),
);

/** Max 1 of each ability across the team. */
export const abilityClause: Clause = duplicateClause(
  "Ability Clause",
  (_species, m) => toID(m.ability),
);

const OHKO_MOVES = new Set(["fissure", "guillotine", "horndrill", "sheercold"]);

/** Bans the one-hit-KO moves. */
export const ohkoClause: Clause = (team) => {
  const errors: string[] = [];
  for (const m of team.members) {
    for (const move of m.moves) {
      if (OHKO_MOVES.has(toID(move))) {
        errors.push(`OHKO Clause: ${m.species} may not use ${move}`);
      }
    }
  }
  return errors;
};

const EVASION_MOVES = new Set(["doubleteam", "minimize"]);

/** Bans the evasion-boosting moves. */
export const evasionClause: Clause = (team) => {
  const errors: string[] = [];
  for (const m of team.members) {
    for (const move of m.moves) {
      if (EVASION_MOVES.has(toID(move))) {
        errors.push(`Evasion Clause: ${m.species} may not use ${move}`);
      }
    }
  }
  return errors;
};

/** Team must have between min and max members (inclusive). */
export function teamSizeClause(min = 1, max = 6): Clause {
  return (team) => {
    if (team.members.length < min || team.members.length > max) {
      return [`Team Size Clause: team has ${team.members.length} members (must be ${min}-${max})`];
    }
    return [];
  };
}

/** No member may exceed the level cap. */
export function levelCapClause(maxLevel = 100): Clause {
  return (team) => {
    const errors: string[] = [];
    for (const m of team.members) {
      const level = m.level ?? 100;
      if (level > maxLevel) {
        errors.push(`Level Cap Clause: ${m.species} is level ${level} (max ${maxLevel})`);
      }
    }
    return errors;
  };
}

/** Run a list of clauses against a team, concatenating all violations. */
export function runClauses(clauses: Clause[], team: PhfTeam): string[] {
  return clauses.flatMap((clause) => clause(team));
}
