import { assertEquals } from "jsr:@std/assert";
import { type PhfTeam, toPokemonSets } from "../../src/teams/types.ts";

const TEAM: PhfTeam = {
  schema: "phf-team/1",
  name: "T",
  gen: 5,
  members: [{
    species: "Politoed",
    ability: "Drizzle",
    item: "Choice Specs",
    nature: "Modest",
    moves: ["Scald", "Ice Beam", "Hydro Pump", "Encore"],
    evs: { spa: 252, spe: 252, hp: 4 },
  }],
};

Deno.test("toPokemonSets applies defaults and copies battle fields", () => {
  const [set] = toPokemonSets(TEAM);
  assertEquals(set.species, "Politoed");
  assertEquals(set.ability, "Drizzle");
  assertEquals(set.item, "Choice Specs");
  assertEquals(set.nature, "Modest");
  assertEquals(set.moves, ["Scald", "Ice Beam", "Hydro Pump", "Encore"]);
  assertEquals(set.level, 100); // default
  assertEquals(set.happiness, 255); // default
  assertEquals(set.evs, { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 });
});

Deno.test("toPokemonSets does not assign IVs", () => {
  const [set] = toPokemonSets(TEAM);
  assertEquals(set.ivs, undefined);
});
