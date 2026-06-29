import { assertEquals } from "@std/assert";
import { gen } from "../../src/dex/gen.ts";
import { toSpeciesDTO } from "../../src/dex/map.ts";

Deno.test("toSpeciesDTO maps core Gen-5 species fields", () => {
  const dto = toSpeciesDTO(gen.species.get("charizard")!);
  assertEquals(dto.id, "charizard");
  assertEquals(dto.num, 6);
  assertEquals(dto.name, "Charizard");
  assertEquals(dto.types, ["Fire", "Flying"]);
  assertEquals(dto.baseStats, { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 });
  assertEquals(dto.abilities.primary, "Blaze");
  assertEquals(dto.abilities.hidden, "Solar Power");
  assertEquals(dto.prevo, "charmeleon");
});

Deno.test("toSpeciesDTO omits optional links for a no-evolution species", () => {
  const dto = toSpeciesDTO(gen.species.get("tauros")!);
  assertEquals(dto.prevo, undefined);
  assertEquals(dto.evos, undefined);
});
