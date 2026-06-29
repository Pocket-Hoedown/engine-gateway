import { assert, assertEquals } from "@std/assert";
import {
  DexNotFoundError,
  getMove,
  getSpecies,
  getTypeChart,
  listSpecies,
} from "../../src/dex/service.ts";

Deno.test("getSpecies resolves display-cased and normalized ids alike", () => {
  assertEquals(getSpecies("Charizard").id, "charizard");
  assertEquals(getSpecies("charizard").num, 6);
});

Deno.test("getSpecies throws DexNotFoundError for an unknown id", () => {
  let err: unknown;
  try {
    getSpecies("notamon");
  } catch (e) {
    err = e;
  }
  assert(err instanceof DexNotFoundError);
});

Deno.test("listSpecies returns the full Gen-5 dex", () => {
  assert(listSpecies().length > 600);
});

Deno.test("getMove and getTypeChart resolve", () => {
  assertEquals(getMove("Thunderbolt").id, "thunderbolt");
  assertEquals(getTypeChart().types.length, 17);
});
