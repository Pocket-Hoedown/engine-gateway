import { assert, assertEquals } from "@std/assert";
import {
  derivePool,
  GymLeaderConfigSchema,
  GymLeaderMode,
  legendaryFor,
} from "../../src/modes/gym_leader.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

Deno.test("derivePool returns only Electric-type, non-Legendary species", () => {
  const pool = derivePool({ type: "Electric" });
  assert(pool.includes("pikachu"));
  assert(!pool.includes("zapdos")); // Legendary — awarded free, not in the draft pool
  assert(!pool.includes("raikou")); // Legendary
});

Deno.test("derivePool excludes banned species", () => {
  const pool = derivePool({ type: "Electric", bans: ["Pikachu"] });
  assert(!pool.includes("pikachu"));
});

Deno.test("legendaryFor returns the native Legendary/Mythical for a type that has one", () => {
  const result = legendaryFor("Electric");
  assertEquals(result.species, "Zapdos");
  assertEquals(result.item, undefined);
});

Deno.test("legendaryFor falls back to Arceus + matching Plate for types without one", () => {
  // Poison has no native Gen-5 Legendary/Mythical.
  const result = legendaryFor("Poison");
  assertEquals(result.species, "Arceus");
  assertEquals(result.item, "Toxic Plate");
});

function team(members: PhfTeam["members"]): PhfTeam {
  return { schema: "phf-team/1", name: "T", gen: 5, members };
}

const BASE = { ability: "Static", nature: "Timid", moves: ["Thunderbolt"] };

Deno.test("GymLeaderMode.validateTeam accepts on-type members plus the free Legendary", () => {
  const t = team([
    { ...BASE, species: "Pikachu" },
    { ...BASE, species: "Zapdos", ability: "Pressure" },
  ]);
  const errors = GymLeaderMode.validateTeam!(t, { type: "Electric" });
  assertEquals(errors, []);
});

Deno.test("GymLeaderMode.validateTeam rejects off-type members", () => {
  const t = team([{ ...BASE, species: "Bulbasaur" }]);
  const errors = GymLeaderMode.validateTeam!(t, { type: "Electric" });
  assert(errors.some((e) => e.includes("not Electric-type")));
});

Deno.test("GymLeaderMode.validateTeam rejects a second Legendary/Mythical", () => {
  const t = team([
    { ...BASE, species: "Zapdos" },
    { ...BASE, species: "Raikou" },
  ]);
  const errors = GymLeaderMode.validateTeam!(t, { type: "Electric" });
  assert(errors.some((e) => e.includes("max 1")));
});

Deno.test("GymLeaderMode.validateTeam surfaces a schema error for an invalid config", () => {
  const t = team([{ ...BASE, species: "Pikachu" }]);
  const errors = GymLeaderMode.validateTeam!(t, { type: 5 });
  assert(errors.some((e) => e.includes("invalid config")));
});

Deno.test("GymLeaderMode.derivePool throws a ZodError for an invalid config", () => {
  let threw = false;
  try {
    GymLeaderMode.derivePool!({ type: 5 });
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("GymLeaderConfigSchema accepts a valid config and rejects a bad one", () => {
  assert(GymLeaderConfigSchema.safeParse({ type: "Electric" }).success);
  assert(!GymLeaderConfigSchema.safeParse({ type: 5 }).success);
  assert(!GymLeaderConfigSchema.safeParse({}).success);
});
