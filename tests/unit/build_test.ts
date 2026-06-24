import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { Dex } from "@pkmn/sim";
import { StandardMode } from "../../src/modes/standard.ts";
import { buildBattleInputs } from "../../src/modes/build.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

const team = (name: string): PhfTeam => ({
  schema: "phf-team/1",
  name,
  gen: 5,
  members: [{
    species: "Tauros",
    ability: "Intimidate",
    nature: "Adamant",
    item: "Leftovers",
    moves: ["Return", "Earthquake", "Rock Slide", "Pursuit"],
    evs: { atk: 252, spe: 252, spd: 4 },
  }],
});

Deno.test("Standard mode maps battle formats to Gen-5 sim format ids", () => {
  assertEquals(StandardMode.compileFormatId("single"), "gen5customgame");
  assertEquals(StandardMode.compileFormatId("double"), "gen5doublescustomgame");
});

Deno.test("buildBattleInputs produces packed teams, a format id, and a sim seed", () => {
  const inputs = buildBattleInputs(StandardMode, "single", [team("A"), team("B")], 12345);
  assertEquals(inputs.formatid, "gen5customgame");
  assertEquals(inputs.packedTeams.length, 2);
  assert(inputs.packedTeams[0].includes("Tauros"));
  assert(inputs.packedTeams[1].includes("Tauros"));
  assertEquals(inputs.seed.length, 4);
});

Deno.test("buildBattleInputs is seed-deterministic (IVs baked into packed teams)", () => {
  const a = buildBattleInputs(StandardMode, "single", [team("A"), team("B")], 777);
  const b = buildBattleInputs(StandardMode, "single", [team("A"), team("B")], 777);
  assertEquals(a.packedTeams, b.packedTeams);
  assertEquals(a.seed, b.seed);
});

Deno.test("buildBattleInputs bakes seeded IVs into packed teams (different seeds differ)", () => {
  const a = buildBattleInputs(StandardMode, "single", [team("A"), team("B")], 1);
  const b = buildBattleInputs(StandardMode, "single", [team("A"), team("B")], 2);
  // Same teams, different seeds: IVs are the only seed-dependent part of the packed
  // string, so differing output proves IVs are assigned and packed in.
  assert(a.packedTeams[0] !== b.packedTeams[0]);
});

Deno.test("Standard mode format ids exist in the sim", () => {
  for (const f of ["single", "double", "triple"] as const) {
    const id = StandardMode.compileFormatId(f);
    assert(Dex.formats.get(id).exists, `format ${id} should exist in the sim`);
  }
});

Deno.test("Standard mode rejects 'multi' until Phase 3", () => {
  assertThrows(() => StandardMode.compileFormatId("multi"));
});
