import { assert, assertEquals } from "@std/assert";
import { StandardMode } from "../../src/modes/standard.ts";
import { validateTeam } from "../../src/teams/validator.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

const LEGAL_TEAM: PhfTeam = {
  schema: "phf-team/1",
  name: "T",
  gen: 5,
  members: [{
    species: "Tauros",
    ability: "Intimidate",
    nature: "Adamant",
    item: "Leftovers",
    moves: ["Return", "Earthquake", "Rock Slide", "Pursuit"],
    evs: { atk: 252, spe: 252, spd: 4 },
  }],
};

Deno.test("validateTeam accepts a legal Standard-mode team", () => {
  const result = validateTeam(LEGAL_TEAM, StandardMode, "single");
  assertEquals(result.valid, true);
  assertEquals(result.errors, []);
});

Deno.test("validateTeam runs Tier 1 clauses (OHKO Clause) even when sim-legal", () => {
  const team: PhfTeam = {
    ...LEGAL_TEAM,
    members: [{
      ...LEGAL_TEAM.members[0],
      moves: ["Earthquake", "Horn Drill", "Return", "Pursuit"],
    }],
  };
  const result = validateTeam(team, StandardMode, "single");
  assertEquals(result.valid, false);
  assert(result.errors.some((e) => e.includes("OHKO Clause")));
});

Deno.test("validateTeam runs Tier 2 sim legality (unknown nature, not a Tier 1 clause concern)", () => {
  const team: PhfTeam = {
    ...LEGAL_TEAM,
    members: [{ ...LEGAL_TEAM.members[0], nature: "NotANature" }],
  };
  const result = validateTeam(team, StandardMode, "single");
  assertEquals(result.valid, false);
  assert(result.errors.some((e) => e.includes("invalid nature")));
});

Deno.test("validateTeam catches duplicate species (Tier 1)", () => {
  const team: PhfTeam = {
    ...LEGAL_TEAM,
    members: [LEGAL_TEAM.members[0], { ...LEGAL_TEAM.members[0], item: "Choice Band" }],
  };
  const result = validateTeam(team, StandardMode, "single");
  assertEquals(result.valid, false);
  assert(result.errors.some((e) => e.includes("Species Clause")));
});
