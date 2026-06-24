import { assert, assertEquals } from "jsr:@std/assert";
import { runMatch, StandardMode } from "../../src/index.ts";
import type { PhfTeam } from "../../src/index.ts";

const TEAM_A: PhfTeam = {
  schema: "phf-team/1",
  name: "Normal Spam",
  gen: 5,
  members: [
    { species: "Tauros", ability: "Intimidate", item: "Leftovers", nature: "Adamant",
      moves: ["Return", "Earthquake", "Rock Slide", "Pursuit"], evs: { atk: 252, spe: 252, spd: 4 } },
    { species: "Starmie", ability: "Natural Cure", item: "Leftovers", nature: "Timid",
      moves: ["Surf", "Thunderbolt", "Ice Beam", "Recover"], evs: { spa: 252, spe: 252, hp: 4 } },
  ],
};

const TEAM_B: PhfTeam = {
  schema: "phf-team/1",
  name: "Fat Balance",
  gen: 5,
  members: [
    { species: "Snorlax", ability: "Thick Fat", item: "Leftovers", nature: "Careful",
      moves: ["Body Slam", "Crunch", "Earthquake", "Rest"], evs: { hp: 252, spd: 252, def: 4 } },
    { species: "Jolteon", ability: "Volt Absorb", item: "Leftovers", nature: "Timid", hpType: "Ice",
      moves: ["Thunderbolt", "Shadow Ball", "Hidden Power", "Baton Pass"], evs: { spa: 252, spe: 252, hp: 4 } },
  ],
};

Deno.test("PROOF OF LIFE: a phf team runs a Gen-5 battle to a winner", async () => {
  const result = await runMatch(StandardMode, "single", [TEAM_A, TEAM_B], 2026);
  assert(result.winner === "P1" || result.winner === "P2", `unexpected winner: ${result.winner}`);
  assert(result.log.some((l) => l.startsWith("|win|")), "transcript must contain a |win| line");
});

Deno.test("REPLAY: same seed reproduces the identical match", async () => {
  const a = await runMatch(StandardMode, "single", [TEAM_A, TEAM_B], 2026);
  const b = await runMatch(StandardMode, "single", [TEAM_A, TEAM_B], 2026);
  assertEquals(a.winner, b.winner);
  assertEquals(a.log, b.log);
});
