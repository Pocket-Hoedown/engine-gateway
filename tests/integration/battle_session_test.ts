import { assert, assertEquals, assertExists } from "@std/assert";
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

async function collectSpectator(session: BattleSession, collected: BattleEvent[]) {
  for await (const event of session.spectator()) {
    collected.push(event);
    if (event.kind === "ended") break;
  }
}

function assertTerminalOrdering(events: BattleEvent[]): void {
  const endedIndex = events.findLastIndex((event) => event.kind === "ended");
  assert(endedIndex > 0);
  const previous = events[endedIndex - 1];
  assertEquals(previous.kind, "state");
  if (previous.kind === "state") assertEquals(previous.state.phase, "ended");
}

function singles(): ControllerSpec[] {
  return [
    { id: "a", side: 0, team: mon("Pikachu", ["Thunderbolt"]) },
    { id: "b", side: 1, team: mon("Rattata", ["Tackle"]) },
  ];
}

Deno.test("single battle emits normalized state and events through terminal ordering", async () => {
  const s = new BattleSession("t1", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  const aEvents: BattleEvent[] = [];
  const bEvents: BattleEvent[] = [];
  const spectatorEvents: BattleEvent[] = [];
  await Promise.all([
    autoplay(s, "a", aEvents),
    autoplay(s, "b", bEvents),
    collectSpectator(s, spectatorEvents),
  ]);
  const { winner } = await s.ended;
  assert(winner === "P1" || winner === "P2");
  assert(s.replay().inputLog.length > 1);

  for (const events of [aEvents, bEvents, spectatorEvents]) {
    assert(events.some((event) => event.kind === "state"));
    assert(events.some((event) => event.kind === "event"));
    assert(events.every((event) => !("lines" in event)));
    assertTerminalOrdering(events);
  }

  const states = aEvents.filter((event) => event.kind === "state");
  assert(states.some((event) => event.state.turn > 0));
  const semantics = aEvents.flatMap((event) => event.kind === "event" ? event.events : []);
  assert(semantics.some((event) => event.type === "move"));
  assert(semantics.some((event) => event.type === "damage"));
  assert(semantics.some((event) => event.type === "faint"));

  const spectatorSemantics = spectatorEvents.flatMap((event) =>
    event.kind === "event" ? event.events : []
  );
  const faintDamage = spectatorSemantics.find((event) => event.type === "damage" && event.hp === 0);
  assertExists(faintDamage);
  if (faintDamage.type === "damage") {
    assertEquals(faintDamage.hpIsPercent, false);
    assert(faintDamage.maxhp > 100);
  }

  const moveIndex = spectatorEvents.findIndex((event) =>
    event.kind === "event" &&
    event.events.some((semantic) => semantic.type === "move" && semantic.source.side === 0)
  );
  assert(moveIndex >= 0);
  const nextEventIndex = spectatorEvents.findIndex((event, index) =>
    index > moveIndex && event.kind === "event"
  );
  const corrected = spectatorEvents.slice(moveIndex + 1, nextEventIndex).filter((event) =>
    event.kind === "state"
  ).at(-1);
  assertExists(corrected);
  if (corrected.kind === "state") {
    const pikachu = [
      ...corrected.state.sides[0].active.filter((pokemon) => pokemon !== null),
      ...corrected.state.sides[0].team,
    ].find((pokemon) => pokemon.speciesForme === "Pikachu");
    assertExists(pikachu);
    const thunderbolt = pikachu.moves.find((move) => move.id === "thunderbolt");
    assertExists(thunderbolt);
    assert((thunderbolt.pp ?? 0) < (thunderbolt.maxpp ?? 0));
  }
});

Deno.test("hidden-info keeps side A exact and side B percentage-scoped", async () => {
  const s = new BattleSession("t2", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 7);
  const aEvents: BattleEvent[] = [];
  await Promise.all([autoplay(s, "a", aEvents), autoplay(s, "b")]);
  await s.ended;
  const aRequests = aEvents.filter((event) => event.kind === "request");
  assert(aRequests.length > 0);
  for (const event of aRequests) {
    for (const pokemon of event.request.team) {
      assert(pokemon.ident.startsWith("p1:"), `leaked ${pokemon.ident}`);
    }
  }

  const states = aEvents.filter((event) => event.kind === "state").map((event) => event.state);
  assert(states.length > 0);
  for (const state of states) {
    const foes = [
      ...state.sides[1].active.filter((pokemon) => pokemon !== null),
      ...state.sides[1].team,
    ];
    for (const foe of foes) {
      assertEquals(foe.hpIsPercent, true);
      assertEquals(foe.maxhp, 100);
      for (const move of foe.moves) {
        assertEquals(move.pp, undefined);
        assertEquals(move.maxpp, undefined);
      }
    }
  }
  const ownKnown = states.flatMap((state) => [
    ...state.sides[0].active.filter((pokemon) => pokemon !== null),
    ...state.sides[0].team,
  ]).find((pokemon) => pokemon.maxhp > 100 && pokemon.moves.some((move) => move.pp !== undefined));
  assertExists(ownKnown);
  assertEquals(ownKnown.hpIsPercent, false);
  assert(ownKnown.ability);
});

Deno.test("spectator starts with exact private state and receives no requests", async () => {
  const s = new BattleSession("t2s", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 17);
  const spectatorEvents: BattleEvent[] = [];
  await Promise.all([
    autoplay(s, "a"),
    autoplay(s, "b"),
    collectSpectator(s, spectatorEvents),
  ]);
  await s.ended;
  assertEquals(spectatorEvents.some((event) => event.kind === "request"), false);
  const firstState = spectatorEvents.find((event) => event.kind === "state");
  assertExists(firstState);
  if (firstState.kind !== "state") throw new Error("unreachable");
  for (const side of firstState.state.sides) {
    const pokemon = [...side.active.filter((entry) => entry !== null), ...side.team];
    assert(pokemon.length > 0);
    for (const entry of pokemon) assertEquals(entry.hpIsPercent, false);
    assert(pokemon.some((entry) => entry.maxhp > 100));
    assert(pokemon.some((entry) => entry.ability !== null));
    assert(pokemon.some((entry) => entry.moves.length > 0));
  }
});

Deno.test("late spectator receives only the latest terminal snapshot", async () => {
  const s = new BattleSession("t2l", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 23);
  await Promise.all([autoplay(s, "a"), autoplay(s, "b")]);
  await s.ended;
  const events: BattleEvent[] = [];
  await collectSpectator(s, events);
  assertEquals(events.map((event) => event.kind), ["state", "ended"]);
  assertTerminalOrdering(events);
});

Deno.test("turn-1 legal-action DTO reflects the team's moves", async () => {
  const s = new BattleSession("t3", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 5);
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
  const aEvents: BattleEvent[] = [];
  await Promise.all([autoplay(s, "a", aEvents), autoplay(s, "b")]);
  const { winner } = await s.ended;
  assert(winner === "P1" || winner === "P2");
  const battleState = aEvents.find((event) =>
    event.kind === "state" && event.state.phase === "battle" &&
    event.state.sides[0].active.every((pokemon) => pokemon !== null)
  );
  assertExists(battleState);
  if (battleState.kind === "state") {
    assertEquals(battleState.state.sides[0].active.length, 2);
    assertEquals(battleState.state.sides[1].active.length, 2);
  }
});

Deno.test("submitChoice joins multi-slot choices and maps to the sim player", () => {
  const s = new BattleSession("t5", {
    mode: StandardMode,
    format: "double",
    controllers: [
      { id: "a", side: 0, team: team(["Pikachu", "Rattata"], ["Thunderbolt", "Tackle"]) },
      { id: "b", side: 1, team: team(["Bulbasaur", "Charmander"], ["Tackle", "Scratch"]) },
    ],
  }, 1);
  s.submitChoice("a", ["move 1 1", "move 1 2"]);
  s.submitChoice("b", ["move 1 1", "move 1 2"]);
  const log = s.replay().inputLog;
  assert(log.some((l) => l === ">p1 move 1 1, move 1 2"), log.join("\n"));
  assert(log.some((l) => l === ">p2 move 1 1, move 1 2"));
  s.destroy();
});

Deno.test("submitChoice with an unknown controller throws", () => {
  const s = new BattleSession("t6", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 1);
  let threw = false;
  try {
    s.submitChoice("nope", ["default"]);
  } catch {
    threw = true;
  }
  assert(threw);
  s.destroy();
});

Deno.test("immediate destroy retains format and team state before ended", async () => {
  const controllers: ControllerSpec[] = [
    { id: "a", side: 0, team: team(["Pikachu", "Rattata"], ["Thunderbolt", "Tackle"]) },
    { id: "b", side: 1, team: team(["Bulbasaur", "Charmander"], ["Tackle", "Scratch"]) },
  ];
  const s = new BattleSession("t7", {
    mode: StandardMode,
    format: "double",
    controllers,
  }, 1);
  s.destroy();
  const drain = async (events: AsyncIterable<BattleEvent>): Promise<BattleEvent[]> => {
    const result: BattleEvent[] = [];
    for await (const event of events) result.push(event);
    return result;
  };
  const [aEvents, bEvents, spectatorEvents] = await Promise.all([
    drain(s.events("a")),
    drain(s.events("b")),
    drain(s.spectator()),
  ]);
  assertTerminalOrdering(aEvents);
  assertTerminalOrdering(bEvents);
  assertTerminalOrdering(spectatorEvents);
  for (const events of [aEvents, bEvents, spectatorEvents]) {
    const state = events.find((event) => event.kind === "state");
    assertExists(state);
    if (state.kind === "state") {
      assertEquals(state.state.gameType, "doubles");
      assertEquals(state.state.sides[0].active.length, 2);
      assertEquals(state.state.sides[1].active.length, 2);
      assertEquals(state.state.sides[0].team.length, 2);
      assertEquals(state.state.sides[1].team.length, 2);
    }
  }
});
