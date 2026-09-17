import { assertEquals, assertThrows } from "@std/assert";
Deno.test("wire errors retain exact choice identity and rqid zero", () => {
  const error = encodeBattleEvent("b", { audience: "controller", controllerId: "a", side: 0 }, {
    kind: "error",
    message: "[Invalid choice] bad",
    choiceId: "opaque",
    rqid: 0,
  });
  assertEquals(error.payload.case, "error");
  if (error.payload.case !== "error") throw new Error("missing error");
  assertEquals(error.payload.value.choiceId, "opaque");
  assertEquals(error.payload.value.rqid, 0);
});

import type { SemanticEvent } from "../../src/battle/events.ts";
import type { BattleState } from "../../src/battle/state.ts";
import {
  encodeBattleEvent,
  encodeSemanticEvent,
  encodeSemanticEvents,
} from "../../src/ws/battle_event.ts";
import {
  encodeFailure,
  encodeReplay,
  encodeRequest,
  encodeState,
  encodeUnexpectedFailure,
} from "../../src/ws/encode.ts";
import {
  Audience,
  BattlePhase,
  BoostStat,
  EffectivenessKind,
  FailureCode,
  GameType,
  Gender,
  RevealKind,
  Side,
  Viewer,
} from "../../src/ws/protocol.ts";
import { WireAdapterError } from "../../src/ws/validation.ts";

const target = { side: 1 as const, slot: 0, player: "p2" as const, name: "Tank" };
const source = { side: 0 as const, slot: 0, player: "p1" as const, name: "Sparky" };

function state(viewer: 0 | 1 | null = 0): BattleState {
  return {
    turn: 3,
    gameType: "doubles",
    phase: "battle",
    viewer,
    weather: { id: "rain", name: "Rain", minTurnsLeft: 2, maxTurnsLeft: 5 },
    pseudoWeather: [{ id: "trickroom", name: "Trick Room", minTurnsLeft: 3 }],
    sides: [
      {
        side: 0,
        player: "p1",
        name: "Alice",
        active: [
          {
            ident: "p1a: Sparky",
            speciesForme: "Pikachu",
            level: 50,
            gender: "M",
            hp: 100,
            maxhp: 120,
            hpIsPercent: false,
            fainted: false,
            status: null,
            boosts: { spa: 2 },
            ability: "static",
            item: null,
            moves: [{ id: "thunderbolt", name: "Thunderbolt", pp: 20, maxpp: 24 }],
            volatiles: [{ id: "confusion", name: "Confusion", level: 1 }],
            lastMove: null,
          },
          null,
        ],
        team: [{
          ident: "p1: Shell",
          speciesForme: "Blastoise",
          level: 50,
          gender: "F",
          hp: 150,
          maxhp: 150,
          hpIsPercent: false,
          fainted: false,
          status: "brn",
          ability: null,
          item: "leftovers",
          moves: [{ id: "surf", name: "Surf" }],
        }],
        hazards: [{ id: "spikes", name: "Spikes", layers: 2 }],
        screens: [{ id: "reflect", name: "Reflect", maxTurnsLeft: 5 }],
      },
      {
        side: 1,
        player: "p2",
        name: "Bob",
        active: [null, null],
        team: [],
        hazards: [],
        screens: [],
      },
    ],
  };
}

Deno.test("encodeRequest preserves optional presence and legal action data", () => {
  const encoded = encodeRequest({
    rqid: 0,
    teamPreview: false,
    wait: true,
    forceSwitch: [true, false],
    active: [{
      trapped: false,
      moves: [{
        id: "surf",
        name: "Surf",
        pp: 23,
        maxpp: 24,
        target: "allAdjacent",
        disabled: false,
      }],
    }],
    team: [{
      ident: "p1: Shell",
      details: "Blastoise, L50, F",
      condition: "150/150",
      active: true,
    }],
  });
  assertEquals(encoded.rqid, 0);
  assertEquals(encoded.teamPreview, false);
  assertEquals(encoded.wait, true);
  assertEquals(encoded.forceSwitch.map(({ required }) => required), [true, false]);
  assertEquals(encoded.active[0].trapped, false);
  assertEquals(encoded.active[0].moves[0].maxPp, 24);
});

Deno.test("encodeState preserves hidden health, exact health, null slots, and nullable fields", () => {
  const controller = encodeState(state(0));
  assertEquals(controller.gameType, GameType.DOUBLES);
  assertEquals(controller.phase, BattlePhase.BATTLE);
  assertEquals(controller.viewer, Viewer.SIDE_ZERO);
  assertEquals(controller.sides.length, 2);
  assertEquals(controller.sides[0].side, Side.ZERO);
  assertEquals(controller.sides[0].active.length, 2);
  assertEquals(controller.sides[0].active[1].pokemon, undefined);
  assertEquals(controller.sides[0].active[0].pokemon?.health?.hp, 100);
  assertEquals(controller.sides[0].active[0].pokemon?.health?.status, undefined);
  assertEquals(controller.sides[0].active[0].pokemon?.item, undefined);
  assertEquals(controller.sides[0].active[0].pokemon?.boosts[0].stat, BoostStat.SPECIAL_ATTACK);
  assertEquals(controller.sides[0].team[0].health?.gender, Gender.FEMALE);
  assertEquals(controller.sides[0].team[0].health?.status, "brn");
  const spectator = encodeState(state(null));
  assertEquals(spectator.viewer, Viewer.SPECTATOR);
});

Deno.test("encodeState validates shape and numeric wire ranges", () => {
  const duplicate = state();
  duplicate.sides[1].side = 0;
  assertThrows(() => encodeState(duplicate), WireAdapterError);
  const invalid = state();
  invalid.sides[0].active[0]!.hp = Number.NaN;
  assertThrows(() => encodeState(invalid), WireAdapterError);
  const negative = state();
  negative.weather!.minTurnsLeft = -1;
  assertThrows(() => encodeState(negative), WireAdapterError);
  const mismatchedPlayer = state();
  mismatchedPlayer.sides[0].player = "p2";
  assertThrows(() => encodeState(mismatchedPlayer), WireAdapterError);
  const invalidEnum = state();
  invalidEnum.gameType = "multi" as BattleState["gameType"];
  assertThrows(() => encodeState(invalidEnum), WireAdapterError);
  const invalidGender = state();
  invalidGender.sides[0].active[0]!.gender = "N" as "M";
  assertThrows(() => encodeState(invalidGender), WireAdapterError);
  const invalidBoost = state();
  invalidBoost.sides[0].active[0]!.boosts = { unknown: 1 } as never;
  assertThrows(() => encodeState(invalidBoost), WireAdapterError);
});

Deno.test("encodeSemanticEvent exhaustively maps every domain variant", () => {
  const events: SemanticEvent[] = [
    { type: "turn", turn: 2 },
    {
      type: "switch",
      side: 0,
      slot: 0,
      ident: "p1a: Sparky",
      speciesForme: "Pikachu",
      dragged: false,
    },
    { type: "move", source, move: "Thunderbolt", target, miss: false, from: "ability" },
    { type: "damage", target, hp: 25, maxhp: 100, hpIsPercent: true, status: null, from: "brn" },
    { type: "heal", target, hp: 80, maxhp: 200, hpIsPercent: false, status: "par" },
    { type: "faint", target },
    { type: "status", target, status: "brn" },
    { type: "curestatus", target, status: "brn" },
    { type: "boost", target, stat: "atk", amount: 1 },
    { type: "unboost", target, stat: "def", amount: 2 },
    { type: "setboost", target, stat: "spe", value: -3 },
    { type: "effectiveness", target, kind: "crit" },
    { type: "weather", weather: null, upkeep: true },
    { type: "sidecondition", side: 1, id: "spikes", name: "Spikes", ended: false },
    { type: "fieldcondition", id: "gravity", name: "Gravity", ended: true },
    { type: "reveal", target, what: "item", value: "Leftovers" },
    { type: "volatile", target, id: "confusion", name: "Confusion", ended: false },
    { type: "cant", target, reason: "par" },
    { type: "raw", name: "message", args: ["hello"], kwArgs: { from: "test", silent: true } },
  ];
  const encoded = events.map(encodeSemanticEvent);
  assertEquals(encoded.map(({ event }) => event.case), [
    "turn",
    "switch",
    "move",
    "damage",
    "heal",
    "faint",
    "status",
    "cureStatus",
    "boost",
    "unboost",
    "setBoost",
    "effectiveness",
    "weather",
    "sideCondition",
    "fieldCondition",
    "reveal",
    "volatile",
    "cant",
    "raw",
  ]);
  assertEquals(encoded[3].event.case === "damage" && encoded[3].event.value.status, undefined);
  assertEquals(
    encoded[11].event.case === "effectiveness" && encoded[11].event.value.kind,
    EffectivenessKind.CRITICAL,
  );
  assertEquals(encoded[12].event.case === "weather" && encoded[12].event.value.weather, undefined);
  assertEquals(
    encoded[15].event.case === "reveal" && encoded[15].event.value.what,
    RevealKind.ITEM,
  );
  const raw = encoded[18].event;
  assertEquals(raw.case === "raw" && raw.value.keywordArgs[0].value?.value, {
    case: "stringValue",
    value: "test",
  });
  assertEquals(raw.case === "raw" && raw.value.keywordArgs[1].value?.value, {
    case: "boolValue",
    value: true,
  });
  assertEquals(encodeSemanticEvents(events).events.length, 19);
});

Deno.test("semantic encoding validates ref consistency and numeric ranges", () => {
  assertThrows(
    () => encodeSemanticEvent({ type: "turn", turn: Infinity }),
    WireAdapterError,
  );
  assertThrows(
    () => encodeSemanticEvent({ type: "faint", target: { ...target, player: "p1" } }),
    WireAdapterError,
  );
  assertThrows(
    () => encodeSemanticEvent({ type: "boost", target, stat: "atk", amount: 0x8000_0000 }),
    WireAdapterError,
  );
  assertThrows(
    () =>
      encodeSemanticEvent({
        type: "switch",
        side: 2 as 0,
        slot: 0,
        ident: "x",
        speciesForme: "x",
        dragged: false,
      }),
    WireAdapterError,
  );
});

Deno.test("encodeBattleEvent maps every BattleEvent and enforces audience consistency", () => {
  const request = encodeBattleEvent("b1", {
    audience: "controller",
    controllerId: "alice",
    side: 0,
  }, {
    kind: "request",
    request: { team: [] },
  });
  assertEquals(request.audience, Audience.CONTROLLER);
  assertEquals(request.controllerId, "alice");
  assertEquals(request.payload.case, "request");
  assertEquals(
    encodeBattleEvent("b1", { audience: "spectator" }, {
      kind: "frame",
      frame: {
        turn: 1,
        phase: "battle",
        protocolLines: ["|move|p1a: Pikachu|Thunderbolt|p2a: Rattata"],
        events: [],
        checkpoint: state(null),
      },
    }).payload.case,
    "frame",
  );
  assertEquals(
    encodeBattleEvent("b1", { audience: "spectator" }, { kind: "event", events: [] }).payload.case,
    "semanticEvents",
  );
  assertEquals(
    encodeBattleEvent("b1", { audience: "controller", controllerId: "alice", side: 0 }, {
      kind: "state",
      state: state(0),
    }).payload.case,
    "state",
  );
  assertEquals(
    encodeBattleEvent("b1", { audience: "spectator" }, { kind: "error", message: "safe" }).payload
      .case,
    "error",
  );
  const ended = encodeBattleEvent("b1", { audience: "spectator" }, { kind: "ended", winner: null });
  assertEquals(ended.payload.case, "ended");
  assertEquals(ended.payload.case === "ended" && ended.payload.value.winner, undefined);
  assertEquals(ended.controllerId, undefined);
  assertThrows(
    () =>
      encodeBattleEvent("b1", { audience: "spectator" }, {
        kind: "request",
        request: { team: [] },
      }),
    WireAdapterError,
  );
  assertThrows(
    () =>
      encodeBattleEvent("b1", { audience: "controller", controllerId: "alice", side: 1 }, {
        kind: "state",
        state: state(0),
      }),
    WireAdapterError,
  );
});

Deno.test("replay and stable failures encode safely", () => {
  const replay = encodeReplay("b1", { seed: 12, inputLog: [">start"] });
  assertEquals([replay.battleId, replay.seed, replay.inputLog], ["b1", 12, [">start"]]);
  assertEquals(encodeFailure("NOT_FOUND", "unknown battle").code, FailureCode.NOT_FOUND);
  assertEquals(
    encodeUnexpectedFailure(new WireAdapterError(FailureCode.INVALID_ARGUMENT, "bad")).message,
    "bad",
  );
  assertEquals(encodeUnexpectedFailure(new Error("secret stack")), {
    $typeName: "pocket_hoedown.v1.CommandFailure",
    code: FailureCode.INTERNAL,
    message: "internal error",
  });
  assertThrows(() => encodeReplay("b1", { seed: -1, inputLog: [] }), WireAdapterError);
});
