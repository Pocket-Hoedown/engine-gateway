import { assertEquals } from "@std/assert";
import { planSpritePack, type SmogonSpecies } from "../../src/sprites/plan.ts";

// Keys are Smogon sids; values carry the join fields. Non-gen5 (Galar) entry must be dropped.
const species: Record<string, SmogonSpecies> = {
  s32: { num: 1, formeNum: 0, base: "Bulbasaur", forme: "", sid: "s32" },
  s96: { num: 3, formeNum: 0, base: "Venusaur", forme: "", sid: "s96" },
  s15329: { num: 479, formeNum: 1, base: "Rotom", forme: "Heat", sid: "s15329" },
  s17762: { num: 555, formeNum: 2, base: "Darmanitan", forme: "Galar", sid: "s17762" },
};
const genIds = new Set(["bulbasaur", "venusaur", "rotomheat"]); // darmanitangalar deliberately absent
const files = new Set([
  "s32.gif",
  "s32-b.gif",
  "s32-s.gif",
  "s32-b-s.gif",
  "s96.gif",
  "s96-b.gif",
  "s96-f.gif",
  "s96-b-f.gif", // Venusaur has a female sprite, no shiny in fixture
  "s15329.gif",
  "s15329-b.gif",
  "s17762.gif", // present but out of scope
]);

Deno.test("planSpritePack keeps only gen(5) ids, renames by id, records availability", () => {
  const { copies, sprites } = planSpritePack(species, genIds, files);

  assertEquals(Object.keys(sprites).sort(), ["bulbasaur", "rotomheat", "venusaur"]);
  assertEquals(sprites["darmanitangalar"], undefined); // out-of-scope dropped

  assertEquals(sprites["bulbasaur"], { back: true, shiny: true, female: false });
  assertEquals(sprites["venusaur"], { back: true, shiny: false, female: true });
  assertEquals(sprites["rotomheat"], { back: true, shiny: false, female: false });

  const to = new Set(copies.map((c) => c.to));
  assertEquals(to.has("bulbasaur-b-s.gif"), true); // renamed by id, suffix preserved
  assertEquals(to.has("venusaur-b-f.gif"), true);
  assertEquals(copies.some((c) => c.from.startsWith("s17762")), false); // nothing out-of-scope copied
});
