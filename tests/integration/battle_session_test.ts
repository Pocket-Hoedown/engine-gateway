import { assert, assertEquals } from "@std/assert";
import { BattleSession } from "../../src/battle/session.ts";
import { StandardMode } from "../../src/modes/standard.ts";
import type { PhfTeam } from "../../src/teams/types.ts";
import type { BattleEvent, ControllerSpec } from "../../src/battle/types.ts";

const mon = (species: string, moves: string[]): PhfTeam => ({
  schema: "phf-team/1",
  name: species,
  gen: 5,
  members: [{ species, ability: "0", nature: "Hardy", moves, level: 100 }],
});

function team(species: string[], moves: string[]): PhfTeam {
  return {
    schema: "phf-team/1",
    name: "T",
    gen: 5,
    members: species.map((s) => ({ species: s, ability: "0", nature: "Hardy", moves, level: 100 })),
  };
}

// A controller that answers every request with `default` (sim picks legal defaults incl. targets).
async function autoplay(session: BattleSession, cid: string, collected?: BattleEvent[]) {
  for await (const ev of session.events(cid)) {
    collected?.push(ev);
    if (ev.kind === "ended") break;
    if (ev.kind === "request" && !ev.request.wait) session.submitChoice(cid, ["default"]);
  }
}

function singles(): ControllerSpec[] {
  return [
    { id: "a", side: 0, team: mon("Pikachu", ["Thunderbolt"]) },
    { id: "b", side: 1, team: mon("Rattata", ["Tackle"]) },
  ];
}

Deno.test("full single battle drives to a winner via submitChoice", async () => {
  const s = new BattleSession("t1", { mode: StandardMode, format: "single", controllers: singles() }, 42);
  await Promise.all([autoplay(s, "a"), autoplay(s, "b")]);
  const { winner } = await s.ended;
  assert(winner === "P1" || winner === "P2");
  assert(s.replay().inputLog.length > 1);
});

Deno.test("hidden-info: side A never receives side B's request/team", async () => {
  const s = new BattleSession("t2", { mode: StandardMode, format: "single", controllers: singles() }, 7);
  const aEvents: BattleEvent[] = [];
  await Promise.all([autoplay(s, "a", aEvents), autoplay(s, "b")]);
  await s.ended;
  const aRequests = aEvents.filter((e) => e.kind === "request") as Extract<BattleEvent, { kind: "request" }>[];
  assert(aRequests.length > 0);
  for (const e of aRequests) {
    for (const p of e.request.team) assert(p.ident.startsWith("p1:"), `leaked ${p.ident}`);
  }
});

Deno.test("turn-1 legal-action DTO reflects the team's moves", async () => {
  const s = new BattleSession("t3", { mode: StandardMode, format: "single", controllers: singles() }, 5);
  let firstActive: Extract<BattleEvent, { kind: "request" }> | undefined;
  const drive = async (cid: string) => {
    for await (const ev of s.events(cid)) {
      if (ev.kind === "ended") break;
      if (ev.kind === "request" && !ev.request.wait) {
        if (cid === "a" && ev.request.active && !firstActive) firstActive = ev;
        s.submitChoice(cid, ["default"]);
      }
    }
  };
  await Promise.all([drive("a"), drive("b")]);
  await s.ended;
  assert(firstActive?.request.active);
  assertEquals(firstActive!.request.active![0].moves[0].name, "Thunderbolt");
});

Deno.test("doubles: a two-active battle drives to completion", async () => {
  const controllers: ControllerSpec[] = [
    { id: "a", side: 0, team: team(["Pikachu", "Rattata"], ["Thunderbolt", "Tackle"]) },
    { id: "b", side: 1, team: team(["Bulbasaur", "Charmander"], ["Tackle", "Scratch"]) },
  ];
  const s = new BattleSession("t4", { mode: StandardMode, format: "double", controllers }, 99);
  await Promise.all([autoplay(s, "a"), autoplay(s, "b")]);
  const { winner } = await s.ended;
  assert(winner === "P1" || winner === "P2");
});

Deno.test("submitChoice joins multi-slot choices and maps to the sim player", () => {
  const s = new BattleSession("t5", { mode: StandardMode, format: "double", controllers: [
    { id: "a", side: 0, team: team(["Pikachu", "Rattata"], ["Thunderbolt", "Tackle"]) },
    { id: "b", side: 1, team: team(["Bulbasaur", "Charmander"], ["Tackle", "Scratch"]) },
  ] }, 1);
  s.submitChoice("a", ["move 1 1", "move 1 2"]);
  s.submitChoice("b", ["move 1 1", "move 1 2"]);
  const log = s.replay().inputLog;
  assert(log.some((l) => l === ">p1 move 1 1, move 1 2"), log.join("\n"));
  assert(log.some((l) => l === ">p2 move 1 1, move 1 2"));
  s.destroy();
});

Deno.test("submitChoice with an unknown controller throws", () => {
  const s = new BattleSession("t6", { mode: StandardMode, format: "single", controllers: singles() }, 1);
  let threw = false;
  try {
    s.submitChoice("nope", ["default"]);
  } catch {
    threw = true;
  }
  assert(threw);
  s.destroy();
});
