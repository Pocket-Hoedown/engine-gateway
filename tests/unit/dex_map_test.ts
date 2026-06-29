import { assert, assertEquals } from "@std/assert";
import { gen } from "../../src/dex/gen.ts";
import { toAbilityDTO, toItemDTO, toMoveDTO, toSpeciesDTO, toTypeChartDTO } from "../../src/dex/map.ts";

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
  assertEquals(dto.eggGroups, ["Monster", "Dragon"]);
  assertEquals(dto.genderRatio, { M: 0.875, F: 0.125 });
  assertEquals(dto.weightkg, 90.5);
});

Deno.test("toSpeciesDTO omits optional links for a no-evolution species", () => {
  const dto = toSpeciesDTO(gen.species.get("tauros")!);
  assertEquals(dto.prevo, undefined);
  assertEquals(dto.evos, undefined);
});

Deno.test("toSpeciesDTO normalizes evolutions to ids", () => {
  const dto = toSpeciesDTO(gen.species.get("charmander")!);
  assertEquals(dto.evos, ["charmeleon"]);
  assertEquals(dto.prevo, undefined);
});

Deno.test("toSpeciesDTO carries baseSpecies and forme for alternate formes", () => {
  const dto = toSpeciesDTO(gen.species.get("rotomheat")!);
  assertEquals(dto.baseSpecies, "Rotom");
  assertEquals(dto.forme, "Heat");
});

Deno.test("toMoveDTO maps a damaging move", () => {
  const dto = toMoveDTO(gen.moves.get("thunderbolt")!);
  assertEquals(dto.id, "thunderbolt");
  assertEquals(dto.type, "Electric");
  assertEquals(dto.category, "Special");
  assertEquals(dto.basePower, 95); // Gen-5 Thunderbolt is 95 BP
  assertEquals(dto.accuracy, 100);
});

Deno.test("toMoveDTO maps a status move and a never-miss move", () => {
  const sd = toMoveDTO(gen.moves.get("swordsdance")!);
  assertEquals(sd.category, "Status");
  assertEquals(sd.basePower, 0);
  const aa = toMoveDTO(gen.moves.get("aerialace")!);
  assertEquals(aa.accuracy, null); // bypasses accuracy
});

Deno.test("toAbilityDTO and toItemDTO map identity fields", () => {
  assertEquals(toAbilityDTO(gen.abilities.get("intimidate")!).name, "Intimidate");
  assertEquals(toItemDTO(gen.items.get("leftovers")!).name, "Leftovers");
});

Deno.test("toTypeChartDTO encodes Gen-5 type effectiveness", () => {
  const chart = toTypeChartDTO(gen);
  assertEquals(chart.types.length, 17);
  assert(!chart.types.includes("Fairy"));
  assertEquals(chart.effectiveness["Fire"]["Grass"], 2);
  assertEquals(chart.effectiveness["Fire"]["Water"], 0.5);
  assertEquals(chart.effectiveness["Ghost"]["Normal"], 0);   // immune
  assertEquals(chart.effectiveness["Electric"]["Ground"], 0); // immune
  assertEquals(chart.effectiveness["Normal"]["Rock"], 0.5);
});
