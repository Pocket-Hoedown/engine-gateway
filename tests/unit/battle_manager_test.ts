import { assert, assertEquals } from "@std/assert";
import { BattleManager } from "../../src/battle/manager.ts";
import { StandardMode } from "../../src/modes/standard.ts";
import type { ControllerSpec } from "../../src/battle/types.ts";
import type { PhfTeam } from "../../src/teams/types.ts";

const mon = (species: string): PhfTeam => ({
  schema: "phf-team/1",
  name: species,
  gen: 5,
  members: [{ species, ability: "0", nature: "Hardy", moves: ["Tackle"], level: 100 }],
});

const okControllers = (): ControllerSpec[] => [
  { id: "a", side: 0, team: mon("Rattata") },
  { id: "b", side: 1, team: mon("Pidgey") },
];

const base = () => ({ mode: StandardMode, format: "single" as const, controllers: okControllers(), seed: 1 });

Deno.test("create → get → end lifecycle", () => {
  const m = new BattleManager();
  const s = m.create(base());
  assertEquals(m.size, 1);
  assertEquals(m.get(s.id), s);
  m.end(s.id);
  assertEquals(m.size, 0);
  assertEquals(m.get(s.id), undefined);
});

Deno.test("create generates and returns a seed when omitted", () => {
  const m = new BattleManager();
  const s = m.create({ mode: StandardMode, format: "single", controllers: okControllers() });
  assert(Number.isFinite(s.seed));
  m.end(s.id);
});

Deno.test("multi is rejected", () => {
  const m = new BattleManager();
  let threw = false;
  try {
    m.create({ ...base(), format: "multi" });
  } catch {
    threw = true;
  }
  assert(threw);
  assertEquals(m.size, 0);
});

Deno.test("wrong controller count / side is rejected", () => {
  const m = new BattleManager();
  const oneSide = [
    { id: "a", side: 0 as const, team: mon("Rattata") },
    { id: "b", side: 0 as const, team: mon("Pidgey") },
  ];
  let threw = false;
  try {
    m.create({ ...base(), controllers: oneSide });
  } catch {
    threw = true;
  }
  assert(threw);
});
