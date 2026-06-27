import { assert, assertEquals } from "@std/assert";
import { gen } from "../../src/dex/gen.ts";

Deno.test("gen(5) exposes Charizard with Gen-5 fields", () => {
  const charizard = gen.species.get("charizard");
  assert(charizard, "Charizard should exist in gen 5");
  assertEquals(charizard.num, 6);
  assertEquals([...charizard.types], ["Fire", "Flying"]);
});

Deno.test("gen(5) excludes post-Gen-5 content (no Fairy type)", () => {
  assert(!gen.types.get("Fairy"), "Fairy must not exist in gen 5");
});

Deno.test("gen(5) learnsets resolve and expose a move map", async () => {
  const ls = await gen.learnsets.get("charmander");
  assert(ls?.learnset, "charmander should have a learnset");
  assert(Object.keys(ls.learnset).length > 0);
});
