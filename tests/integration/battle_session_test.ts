import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import { BattleSession } from "../../src/battle/session.ts";
import { StandardMode } from "../../src/modes/standard.ts";
import type { PhfTeam } from "../../src/teams/types.ts";
import type { BattleEvent, ControllerSpec } from "../../src/battle/types.ts";

import { BattleRequestError } from "../../src/battle/types.ts";

Deno.test("bare percentages and colored health update spectator checkpoints", async () => {
  const session = new BattleSession("health-syntax", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  const iterator = session.spectator()[Symbol.asyncIterator]();
  try {
    await iterator.next();
    session["streams"].spectator.push("|switch|p1a: Pikachu|Pikachu, M|100/100");
    await iterator.next();
    const cases: Array<[string, number, string | null, boolean]> = [
      ["50", 50, null, false],
      ["50.5 par", 51, "par", false],
      ["24/48y", 50, null, false],
      ["36/48g brn", 75, "brn", false],
      ["9/48r", 19, null, false],
      ["0/48r fnt", 0, null, true],
    ];
    for (const [token, hp, status, fainted] of cases) {
      // A public turn line ensures an incorrectly dropped health update still emits
      // a frame, so the regression fails on checkpoint behavior rather than hanging.
      session["streams"].spectator.push(`|-damage|p1a: Pikachu|${token}\n|turn|2`);
      const event: BattleEvent = (await iterator.next()).value;
      assertEquals(event.kind, "frame");
      if (event.kind !== "frame") throw new Error("missing frame");
      assert(event.frame.protocolLines.some((line) => line.startsWith("|-damage|")), token);
      const pokemon = event.frame.checkpoint.sides[0].active[0]!;
      assertEquals(pokemon.hp, hp, token);
      assertEquals(pokemon.maxhp, 100);
      assertEquals(pokemon.hpIsPercent, true);
      assertEquals(pokemon.status, status);
      assertEquals(pokemon.fainted, fainted);
    }
  } finally {
    session.destroy();
  }
});

Deno.test("malformed requests emit controlled errors without leaking or killing side pumps", async () => {
  const session = new BattleSession("malformed-request", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  const iterator = session.events("a")[Symbol.asyncIterator]();
  try {
    while ((await iterator.next()).value?.kind !== "request") { /* Drain initialization. */ }
    for (
      const malformed of [
        '{"Secret Request":',
        "null",
        "[]",
        '{"side":{"pokemon":{}}}',
        '{"active":false}',
        '{"active":[{"moves":[],"trapped":"Secret Request"}]}',
      ]
    ) {
      session["streams"].p1.push(`|request|${malformed}`);
      const error = (await iterator.next()).value;
      assertEquals(error, { kind: "error", message: "Invalid simulator request" });
      assert(!JSON.stringify(error).includes("Secret Request"));
    }
    session["streams"].p1.push(
      '|error|before\n|request|{"rqid":21}\n|error|between\n|request|{"rqid":22}',
    );
    const events: BattleEvent[] = [];
    for (let i = 0; i < 6; i++) events.push((await iterator.next()).value!);
    assertEquals(events.map((e) => e.kind), [
      "error",
      "frame",
      "request",
      "error",
      "frame",
      "request",
    ]);
    assertEquals(events.flatMap((e) => e.kind === "request" ? [e.request.rqid] : []), [21, 22]);
    for (const event of events) {
      if (event.kind !== "frame") continue;
      assertEquals(event.frame.protocolLines, []);
      assert(!event.frame.events.some((e) => e.type === "raw" && e.name === "request"));
      assert(!JSON.stringify(event.frame.events).includes("rqid"));
    }
    session["streams"].p1.push('|request|{"Secret Request":\n|win|P1');
    assertEquals((await iterator.next()).value, {
      kind: "error",
      message: "Invalid simulator request",
    });
    const frame: BattleEvent = (await iterator.next()).value!;
    assertEquals(frame.kind, "frame");
    if (frame.kind === "frame") {
      assertEquals(frame.frame.protocolLines, ["|win|P1"]);
      assertEquals(frame.frame.checkpoint.phase, "ended");
      assert(!JSON.stringify(frame.frame.events).includes("Secret Request"));
      assert(!frame.frame.events.some((e) => e.type === "raw" && e.name === "request"));
    }
    assertEquals((await iterator.next()).value, { kind: "ended", winner: "P1" });
  } finally {
    session.destroy();
  }
});

Deno.test("private requests follow a render-safe checkpoint boundary", async () => {
  const session = new BattleSession("privacy-order", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  let previous: BattleEvent | undefined;
  try {
    for await (const event of session.events("a")) {
      if (event.kind === "frame") {
        assert(event.frame.protocolLines.every((line) => !line.includes("|request|")));
      }
      if (event.kind === "request") {
        assertEquals(previous?.kind, "frame");
        if (previous?.kind === "frame") {
          assertEquals(previous.frame.protocolLines, []);
          const own = previous.frame.checkpoint.sides[0];
          const pokemon = [...own.active, ...own.team].filter((mon) => mon !== null);
          assert(pokemon.some((mon) => mon.moves.length > 0));
          assert(pokemon.some((mon) => mon.maxhp > 100 && !mon.hpIsPercent));
        }
        break;
      }
      previous = event;
    }
  } finally {
    session.destroy();
  }
});

Deno.test("decimal spectator health stays public in active bench events and checkpoints", async () => {
  const session = new BattleSession("decimal-health", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  const iterator = session.spectator()[Symbol.asyncIterator]();
  try {
    await iterator.next();
    session["streams"].spectator.push([
      "|switch|p1a: Pikachu|Pikachu, M|123.5/211.5 par",
      "|-damage|p1a: Pikachu|123.5/211.5 par",
      "|switch|p1a: Bulbasaur|Bulbasaur, M|1.5/7.5",
      "|-heal|not-an-ident|123.5/211.5 par",
    ].join("\n"));
    const event: BattleEvent = (await iterator.next()).value;
    assertEquals(event.kind, "frame");
    if (event.kind !== "frame") throw new Error("missing checkpoint");
    assert(!JSON.stringify(event.frame).includes("211.5"));
    assert(!JSON.stringify(event.frame).includes("123.5"));
    const side = event.frame.checkpoint.sides[0];
    assertEquals(side.active[0]?.hp, 20);
    const bench = side.team.find((p) => p.speciesForme === "Pikachu");
    assertExists(bench);
    assertEquals(bench.hp, 59);
    for (const mon of [side.active[0]!, bench]) {
      assertEquals(mon.maxhp, 100);
      assertEquals(mon.hpIsPercent, true);
      assertEquals(mon.item, null);
      assertEquals(mon.ability, null);
      assertEquals(mon.moves, []);
    }
    const damage = event.frame.events.find((e) => e.type === "damage");
    assertExists(damage);
    if (damage.type === "damage") {
      assertEquals(damage.hp, 59);
      assertEquals(damage.maxhp, 100);
      assertEquals(damage.hpIsPercent, true);
    }
    const fallback = event.frame.events.find((e) => e.type === "raw" && e.name === "-heal");
    assertExists(fallback);
    if (fallback.type === "raw") assertEquals(fallback.args, ["not-an-ident", "59/100 par"]);
  } finally {
    session.destroy();
  }
});

Deno.test("spectator canaries are absent before public reveals", async () => {
  const controllers = singles();
  controllers[0].team.members[0].item = "Choice Band";
  const session = new BattleSession("privacy-canary", {
    mode: StandardMode,
    format: "single",
    controllers,
  }, 42);
  try {
    const { value } = await session.spectator()[Symbol.asyncIterator]().next();
    assertEquals(value.kind, "frame");
    const serialized = JSON.stringify(value);
    for (const secret of ["Choice Band", "Static", "Thunderbolt", "thunderbolt", "|request|"]) {
      assert(!serialized.includes(secret), `spectator leaked ${secret}`);
    }
    if (value.kind === "frame") {
      for (const side of value.frame.checkpoint.sides) {
        for (const mon of side.team) {
          assertEquals(mon.hpIsPercent, true);
          assertEquals(mon.maxhp, 100);
        }
      }
    }
  } finally {
    session.destroy();
  }
});

Deno.test("duplicate request consumption writes no additional simulator input", async () => {
  const session = new BattleSession("duplicate", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  try {
    for await (const event of session.events("a")) {
      if (event.kind !== "request" || event.request.wait) continue;
      assertEquals(event.request.rqid, undefined);
      session.submitChoice("a", ["default"]);
      const before = session.replay().inputLog;
      assertThrows(
        () => session.submitChoice("a", ["default"]),
        BattleRequestError,
        "no pending request",
      );
      assertEquals(session.replay().inputLog, before);
      break;
    }
  } finally {
    session.destroy();
  }
});

Deno.test("invalid simulator choice emits side error and corrected choice progresses", async () => {
  const session = new BattleSession("invalid", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  let invalid = false;
  let corrected = false;
  let progressed = false;
  try {
    await Promise.all([
      autoplay(session, "b"),
      (async () => {
        for await (const event of session.events("a")) {
          if (event.kind === "error") {
            assert(event.message.startsWith("[Invalid choice]"), event.message);
            assert(invalid);
            session.submitChoice("a", ["default"]);
            corrected = true;
          }
          if (event.kind !== "request" || event.request.wait) continue;
          if (!invalid && event.request.active) {
            invalid = true;
            session.submitChoice("a", ["move 99"]);
            const before = session.replay().inputLog;
            assertThrows(() => session.submitChoice("a", ["default"]), BattleRequestError);
            assertEquals(session.replay().inputLog, before);
          } else {
            if (corrected) progressed = true;
            session.submitChoice("a", ["default"]);
          }
        }
      })(),
    ]);
    assert(invalid && corrected && progressed);
  } finally {
    session.destroy();
  }
});

Deno.test("side stream preserves rqid zero, clears wait, and opens later actionable requests", async () => {
  const session = new BattleSession("side-boundary", {
    mode: StandardMode,
    format: "single",
    controllers: singles(),
  }, 42);
  const events = session.events("a")[Symbol.asyncIterator]();
  const nextRequest = async () => {
    while (true) {
      const { value, done } = await events.next();
      assert(!done);
      if (value.kind === "request") return value.request;
    }
  };
  try {
    await nextRequest();
    // Inject at the actual simulator output boundary: this sim version omits rqid.
    session["streams"].p1.push('|request|{"rqid":0}');
    assertEquals((await nextRequest()).rqid, 0);
    const before = session.replay().inputLog;
    for (const rqid of [undefined, 1]) {
      assertThrows(
        () => session.submitChoice("a", ["default"], rqid),
        BattleRequestError,
        "stale request",
      );
      assertEquals(session.replay().inputLog, before);
    }
    session["streams"].p1.push('|request|{"wait":true}');
    assertEquals((await nextRequest()).wait, true);
    assertThrows(
      () => session.submitChoice("a", ["default"], 0),
      BattleRequestError,
      "no pending request",
    );
    assertEquals(session.replay().inputLog, before);
    session["streams"].p1.push('|request|{"rqid":0}\n|error|[Invalid choice] delayed');
    await nextRequest();
    session.submitChoice("a", ["default"], 0);
    assertEquals(session.replay().inputLog, [...before, ">p1 default"]);
    session["streams"].p1.push("|error|[Unavailable choice] unrelated");
    while (true) {
      const { value, done } = await events.next();
      assert(!done);
      if (value.kind === "error" && value.message === "[Unavailable choice] unrelated") break;
    }
    assertThrows(
      () => session.submitChoice("a", ["default"], 0),
      BattleRequestError,
      "no pending request",
    );
  } finally {
    session.destroy();
  }
});

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
  assertEquals(previous.kind, "frame");
  if (previous.kind === "frame") assertEquals(previous.frame.checkpoint.phase, "ended");
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
    assert(events.some((event) => event.kind === "frame"));
    assertTerminalOrdering(events);
    for (const [index, event] of events.entries()) {
      if (event.kind === "request") assertEquals(events[index - 1]?.kind, "frame");
      if (event.kind !== "frame") continue;
      assert(event.frame.protocolLines.every((line) => !line.includes("|request|")));
      if (events === spectatorEvents) {
        for (const line of event.frame.protocolLines) {
          if (/^\|(?:switch|drag|-damage|-heal)\|/.test(line)) {
            const health =
              line.split("|")[line.startsWith("|switch|") || line.startsWith("|drag|") ? 4 : 3];
            assert(!health.includes("/") || /\/100(?: |$)/.test(health), line);
          }
        }
      }
    }
  }

  const frames = aEvents.flatMap((event) => event.kind === "frame" ? [event.frame] : []);
  assert(frames.some((frame) => frame.checkpoint.turn > 0));
  assert(frames.some((frame) => frame.protocolLines.length > 0));
  const semantics = frames.flatMap((frame) => frame.events);
  assert(semantics.some((event) => event.type === "move"));
  assert(semantics.some((event) => event.type === "damage"));
  assert(semantics.some((event) => event.type === "faint"));

  const spectatorSemantics = spectatorEvents.flatMap((event) =>
    event.kind === "frame" ? event.frame.events : []
  );
  const faintDamage = spectatorSemantics.find((event) => event.type === "damage" && event.hp === 0);
  assertExists(faintDamage);
  if (faintDamage.type === "damage") {
    assertEquals(faintDamage.hpIsPercent, true);
    assertEquals(faintDamage.maxhp, 100);
  }

  const moveFrame = spectatorEvents.find((event) =>
    event.kind === "frame" &&
    event.frame.events.some((semantic) => semantic.type === "move" && semantic.source.side === 0)
  );
  assertExists(moveFrame);
  const subsequentFrames = spectatorEvents.slice(
    spectatorEvents.indexOf(moveFrame!),
  ).flatMap((event) => event.kind === "frame" ? [event.frame] : []);
  for (const frame of subsequentFrames) {
    for (const side of frame.checkpoint.sides) {
      for (const pokemon of [...side.active, ...side.team]) {
        if (!pokemon) continue;
        assertEquals(pokemon.moves, []);
        assertEquals(pokemon.item, null);
        assertEquals(pokemon.ability, null);
      }
    }
    assert(frame.protocolLines.every((line) => !line.includes("|request|")));
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

  const states = aEvents.flatMap((event) => event.kind === "frame" ? [event.frame.checkpoint] : []);
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

Deno.test("spectator starts with public state and receives no requests", async () => {
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
  const firstFrame = spectatorEvents.find((event) => event.kind === "frame");
  assertExists(firstFrame);
  if (firstFrame.kind !== "frame") throw new Error("unreachable");
  for (const side of firstFrame.frame.checkpoint.sides) {
    const pokemon = [...side.active.filter((entry) => entry !== null), ...side.team];
    assert(pokemon.length > 0);
    for (const entry of pokemon) {
      assertEquals(entry.hpIsPercent, true);
      assertEquals(entry.maxhp, 100);
      assertEquals(entry.ability, null);
      assertEquals(entry.item, null);
      assertEquals(entry.moves, []);
    }
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
  assertEquals(events.map((event) => event.kind), ["frame", "ended"]);
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
    event.kind === "frame" && event.frame.checkpoint.phase === "battle" &&
    event.frame.checkpoint.sides[0].active.every((pokemon) => pokemon !== null)
  );
  assertExists(battleState);
  if (battleState.kind === "frame") {
    assertEquals(battleState.frame.checkpoint.sides[0].active.length, 2);
    assertEquals(battleState.frame.checkpoint.sides[1].active.length, 2);
  }
});

Deno.test("submitChoice joins multi-slot choices and maps to the sim player", async () => {
  const s = new BattleSession("t5", {
    mode: StandardMode,
    format: "double",
    controllers: [
      { id: "a", side: 0, team: team(["Pikachu", "Rattata"], ["Thunderbolt", "Tackle"]) },
      { id: "b", side: 1, team: team(["Bulbasaur", "Charmander"], ["Tackle", "Scratch"]) },
    ],
  }, 1);
  try {
    await Promise.all(["a", "b"].map(async (cid) => {
      for await (const ev of s.events(cid)) {
        if (ev.kind !== "request" || ev.request.wait) continue;
        if (ev.request.active) return;
        if (ev.request.teamPreview) s.submitChoice(cid, ["default"]);
      }
      throw new Error(`No active request for ${cid}`);
    }));
    s.submitChoice("a", ["move 1 1", "move 1 2"]);
    s.submitChoice("b", ["move 1 1", "move 1 2"]);
    const log = s.replay().inputLog;
    assert(log.some((l) => l === ">p1 move 1 1, move 1 2"), log.join("\n"));
    assert(log.some((l) => l === ">p2 move 1 1, move 1 2"));
  } finally {
    s.destroy();
  }
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
    const frame = events.find((event) => event.kind === "frame");
    assertExists(frame);
    if (frame.kind === "frame") {
      assertEquals(frame.frame.checkpoint.gameType, "doubles");
      assertEquals(frame.frame.checkpoint.sides[0].active.length, 2);
      assertEquals(frame.frame.checkpoint.sides[1].active.length, 2);
      const knownTeamSize = events === spectatorEvents ? 0 : 2;
      assertEquals(frame.frame.checkpoint.sides[0].team.length, knownTeamSize);
      assertEquals(frame.frame.checkpoint.sides[1].team.length, knownTeamSize);
    }
  }
});
