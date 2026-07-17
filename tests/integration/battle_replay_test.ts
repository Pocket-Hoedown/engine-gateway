import { assert, assertEquals } from "@std/assert";
import { BattleSession, reconstruct } from "../../src/battle/session.ts";
import { StandardMode } from "../../src/modes/standard.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

const mon = (species: string, moves: string[]): PhfTeam => ({
  schema: "phf-team/1",
  name: species,
  gen: 5,
  members: [{ species, ability: "0", nature: "Hardy", moves, level: 100 }],
});

async function playToEnd(seed: number) {
  const s = new BattleSession("r", {
    mode: StandardMode,
    format: "single",
    controllers: [
      { id: "a", side: 0, team: mon("Pikachu", ["Thunderbolt"]) },
      { id: "b", side: 1, team: mon("Rattata", ["Tackle"]) },
    ],
  }, seed);
  const drive = async (cid: string) => {
    for await (const ev of s.events(cid)) {
      if (ev.kind === "ended") break;
      if (ev.kind === "request" && !ev.request.wait) s.submitChoice(cid, ["default"]);
    }
  };
  await Promise.all([drive("a"), drive("b")]);
  const outcome = await s.ended;
  return { replay: s.replay(), outcome };
}

Deno.test("reconstruct reproduces the same battle from the input log", async () => {
  const { replay, outcome } = await playToEnd(2024);
  const r1 = await reconstruct(replay);
  const r2 = await reconstruct(replay);
  assertEquals(r1.winner, r2.winner);
  assertEquals(r1.log, r2.log);
  assertEquals(r1.winner, outcome.winner);
  assert(r1.log.length > 0);
});
