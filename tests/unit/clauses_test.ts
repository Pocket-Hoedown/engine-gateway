import { assertEquals } from "@std/assert";
import {
  abilityClause,
  evasionClause,
  itemClause,
  levelCapClause,
  ohkoClause,
  runClauses,
  speciesClause,
  teamSizeClause,
} from "../../src/teams/clauses.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

function team(members: PhfTeam["members"]): PhfTeam {
  return { schema: "phf-team/1", name: "T", gen: 5, members };
}

const BASE_MEMBER = {
  ability: "Levitate",
  nature: "Modest",
  moves: ["Thunderbolt"],
};

Deno.test("speciesClause allows unique species", () => {
  const t = team([
    { ...BASE_MEMBER, species: "Rotom" },
    { ...BASE_MEMBER, species: "Zapdos" },
  ]);
  assertEquals(speciesClause(t), []);
});

Deno.test("speciesClause flags duplicate base species (formes count together)", () => {
  const t = team([
    { ...BASE_MEMBER, species: "Rotom" },
    { ...BASE_MEMBER, species: "Rotom-Heat" },
  ]);
  assertEquals(speciesClause(t).length, 1);
});

Deno.test("itemClause flags duplicate held items, ignores no-item", () => {
  const t = team([
    { ...BASE_MEMBER, species: "Rotom", item: "Leftovers" },
    { ...BASE_MEMBER, species: "Zapdos", item: "Leftovers" },
    { ...BASE_MEMBER, species: "Raikou" },
  ]);
  assertEquals(itemClause(t).length, 1);
});

Deno.test("abilityClause flags duplicate abilities", () => {
  const t = team([
    { ...BASE_MEMBER, species: "Rotom", ability: "Levitate" },
    { ...BASE_MEMBER, species: "Zapdos", ability: "Levitate" },
  ]);
  assertEquals(abilityClause(t).length, 1);
});

Deno.test("ohkoClause flags OHKO moves", () => {
  const t = team([{ ...BASE_MEMBER, species: "Rhydon", moves: ["Fissure"] }]);
  assertEquals(ohkoClause(t).length, 1);
});

Deno.test("ohkoClause allows non-OHKO moves", () => {
  const t = team([{ ...BASE_MEMBER, species: "Rhydon", moves: ["Earthquake"] }]);
  assertEquals(ohkoClause(t), []);
});

Deno.test("evasionClause flags evasion moves", () => {
  const t = team([{ ...BASE_MEMBER, species: "Umbreon", moves: ["Double Team"] }]);
  assertEquals(evasionClause(t).length, 1);
});

Deno.test("teamSizeClause enforces bounds", () => {
  const clause = teamSizeClause(2, 6);
  assertEquals(clause(team([{ ...BASE_MEMBER, species: "Rotom" }])).length, 1);
  assertEquals(
    clause(team([{ ...BASE_MEMBER, species: "Rotom" }, { ...BASE_MEMBER, species: "Zapdos" }])),
    [],
  );
});

Deno.test("levelCapClause flags over-cap levels", () => {
  const clause = levelCapClause(50);
  const t = team([{ ...BASE_MEMBER, species: "Rotom", level: 100 }]);
  assertEquals(clause(t).length, 1);
});

Deno.test("runClauses concatenates violations from multiple clauses", () => {
  const t = team([
    { ...BASE_MEMBER, species: "Rotom", item: "Leftovers", moves: ["Fissure"] },
    { ...BASE_MEMBER, species: "Rotom-Heat", item: "Leftovers", moves: ["Thunderbolt"] },
  ]);
  const errors = runClauses([speciesClause, itemClause, ohkoClause], t);
  assertEquals(errors.length, 3);
});
