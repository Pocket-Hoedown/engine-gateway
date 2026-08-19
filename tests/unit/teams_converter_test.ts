import { assert, assertEquals } from "@std/assert";
import {
  parseShowdownPacked,
  parseShowdownText,
  toShowdownPacked,
  toShowdownText,
} from "../../src/teams/converter.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

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

Deno.test("toShowdownText renders an importable Showdown export", () => {
  const text = toShowdownText(TEAM);
  assert(text.includes("Politoed"));
  assert(text.includes("Drizzle"));
});

Deno.test("parseShowdownText round-trips species/ability/item/moves", () => {
  const text = toShowdownText(TEAM);
  const parsed = parseShowdownText(text);
  assertEquals(parsed.members[0].species, "Politoed");
  assertEquals(parsed.members[0].ability, "Drizzle");
  assertEquals(parsed.members[0].item, "Choice Specs");
  assertEquals(parsed.members[0].moves, ["Scald", "Ice Beam", "Hydro Pump", "Encore"]);
});

Deno.test("toShowdownPacked / parseShowdownPacked round-trip", () => {
  const packed = toShowdownPacked(TEAM);
  const parsed = parseShowdownPacked(packed);
  assertEquals(parsed.members[0].species, "Politoed");
  assertEquals(parsed.members[0].ability, "Drizzle");
});
