import { assert } from "@std/assert";
import { gen } from "../../src/dex/gen.ts";
import { legalMovepool } from "../../src/dex/learnset.ts";

Deno.test("legalMovepool is a superset of the species' own learnset (inheritance)", async () => {
  const own = new Set(Object.keys((await gen.learnsets.get("charizard"))?.learnset ?? {}));
  const full = await legalMovepool("charizard");
  for (const move of own) assert(full.includes(move), `missing own move ${move}`);
  // Walking the chain must add at least one pre-evolution-only move.
  assert(full.length > own.size, "expected inherited moves from charmander/charmeleon");
});

Deno.test("legalMovepool returns sorted, unique ids", async () => {
  const full = await legalMovepool("charizard");
  const sortedUnique = [...new Set(full)].sort();
  assert(full.length === sortedUnique.length && full.every((m: string, i: number) => m === sortedUnique[i]));
});

Deno.test("legalMovepool handles a species with no pre-evolution", async () => {
  const full = await legalMovepool("tauros");
  assert(full.length > 0);
});
