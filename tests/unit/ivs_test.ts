import { assert, assertEquals } from "jsr:@std/assert";
import { mulberry32 } from "../../src/teams/rng.ts";
import { assignTeamIVs, computeHpType, randomizeIVs } from "../../src/teams/ivs.ts";
import { type PhfMember, toPokemonSets } from "../../src/teams/types.ts";

Deno.test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assertEquals([a(), a(), a()], [b(), b(), b()]);
});

Deno.test("randomizeIVs honors a requested Hidden Power type", () => {
  const member: PhfMember = { species: "Jolteon", ability: "Volt Absorb", nature: "Timid", moves: ["Hidden Power"], hpType: "Ice" };
  for (let s = 0; s < 25; s++) {
    const ivs = randomizeIVs(member, mulberry32(s));
    assertEquals(computeHpType(ivs), "Ice", `seed ${s} produced wrong HP type`);
    for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as const) {
      assert(ivs[stat] >= 0 && ivs[stat] <= 31);
    }
  }
});

Deno.test("randomizeIVs with no hpType yields in-range IVs", () => {
  const member: PhfMember = { species: "Tauros", ability: "Intimidate", nature: "Adamant", moves: ["Return"] };
  const ivs = randomizeIVs(member, mulberry32(7));
  for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"] as const) {
    assert(ivs[stat] >= 0 && ivs[stat] <= 31);
  }
});

Deno.test("assignTeamIVs is seed-deterministic and sets ivs on every set", () => {
  const member: PhfMember = { species: "Tauros", ability: "Intimidate", nature: "Adamant", moves: ["Return"] };
  const team = { schema: "phf-team/1" as const, name: "T", gen: 5 as const, members: [member] };
  const a = assignTeamIVs(toPokemonSets(team), team.members, 99);
  const b = assignTeamIVs(toPokemonSets(team), team.members, 99);
  assertEquals(a[0].ivs, b[0].ivs);
  assert(a[0].ivs !== undefined);
});
