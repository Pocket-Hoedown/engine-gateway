import { assert, assertEquals } from "@std/assert";
import { runHeadlessBattle, type SimSeed } from "../../src/battle/runner.ts";

// Two simple, legal Gen-5 sets in Showdown packed format (singles, Custom Game).
const TEAM_A =
  "Tauros||leftovers|intimidate|return,earthquake,rockslide,pursuit|Adamant|,252,,,4,252|||||]" +
  "Starmie||leftovers|naturalcure|surf,thunderbolt,icebeam,recover|Timid|,,,252,4,252|||||";
const TEAM_B =
  "Snorlax||leftovers|thickfat|bodyslam,crunch,earthquake,rest|Careful|252,,4,,252,|||||]" +
  "Jolteon||leftovers|voltabsorb|thunderbolt,shadowball,hiddenpowerice,batonpass|Timid|,,,252,4,252|||||";

const SEED: SimSeed = [1, 2, 3, 4];

Deno.test("a Gen-5 battle runs headless to a winner", async () => {
  const result = await runHeadlessBattle({
    formatid: "gen5customgame",
    packedTeams: [TEAM_A, TEAM_B],
    seed: SEED,
  });
  assert(result.winner === "P1" || result.winner === "P2", `unexpected winner: ${result.winner}`);
  assert(result.log.length > 0, "expected a non-empty transcript");
});

Deno.test("same seed produces an identical transcript (determinism)", async () => {
  const a = await runHeadlessBattle({ formatid: "gen5customgame", packedTeams: [TEAM_A, TEAM_B], seed: SEED });
  const b = await runHeadlessBattle({ formatid: "gen5customgame", packedTeams: [TEAM_A, TEAM_B], seed: SEED });
  assertEquals(a.log, b.log);
  assertEquals(a.winner, b.winner);
});

Deno.test("transcript excludes the sim's wall-clock timestamps (deterministic replay)", async () => {
  const result = await runHeadlessBattle({ formatid: "gen5customgame", packedTeams: [TEAM_A, TEAM_B], seed: SEED });
  // The sim emits `|t:|<unixtime>` at the start of every turn. Those lines are
  // wall-clock, not seed-derived, so two same-seed runs that straddle a one-second
  // boundary diverge — the real cause of the determinism flake. They must never
  // appear in the replay transcript.
  assert(!result.log.some((l) => l.startsWith("|t:|")), "transcript must not contain wall-clock |t:| lines");
});
