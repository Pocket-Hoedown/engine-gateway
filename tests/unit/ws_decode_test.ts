import { create } from "@bufbuild/protobuf";
import { assertEquals, assertThrows } from "@std/assert";
import { decodeCreateBattle, decodeTeam, resolveMode } from "../../src/ws/decode.ts";
import {
  BattleFormat,
  CreateBattleSchema,
  Gender,
  PhfTeamSchema,
  Side,
} from "../../src/ws/protocol.ts";
import { WireAdapterError } from "../../src/ws/validation.ts";
import { StandardMode } from "../../src/modes/standard.ts";

function team() {
  return {
    schema: "phf-team/1",
    name: "Alpha",
    gen: 5,
    tags: ["test"],
    members: [{
      species: "Pikachu",
      ability: "Static",
      nature: "Timid",
      moves: ["Thunderbolt"],
      item: "Light Ball",
      level: 50,
      gender: Gender.FEMALE,
      shiny: false,
      happiness: 200,
      hpType: "Ice",
      evs: { hp: 4, spa: 252, spe: 252 },
    }],
  };
}

function createMessage() {
  return create(CreateBattleSchema, {
    modeId: "standard",
    format: BattleFormat.SINGLE,
    seed: 0xffff_ffff,
    controllers: [
      { id: "alice", side: Side.ZERO, team: team() },
      { id: "bob", side: Side.ONE, team: team() },
    ],
  });
}

Deno.test("decodeCreateBattle resolves StandardMode and preserves team optionals", () => {
  assertEquals(resolveMode("standard"), StandardMode);
  const decoded = decodeCreateBattle(createMessage());
  assertEquals(decoded.mode, StandardMode);
  assertEquals(decoded.format, "single");
  assertEquals(decoded.seed, 0xffff_ffff);
  assertEquals(decoded.controllers[0], {
    id: "alice",
    side: 0,
    team: {
      schema: "phf-team/1",
      name: "Alpha",
      gen: 5,
      tags: ["test"],
      members: [{
        species: "Pikachu",
        ability: "Static",
        nature: "Timid",
        moves: ["Thunderbolt"],
        item: "Light Ball",
        level: 50,
        gender: "F",
        shiny: false,
        happiness: 200,
        hpType: "Ice",
        evs: { hp: 4, spa: 252, spe: 252 },
      }],
    },
  });
});

Deno.test("decodeCreateBattle accepts every supported format and legal side", () => {
  for (
    const [wire, domain] of [
      [BattleFormat.SINGLE, "single"],
      [BattleFormat.DOUBLE, "double"],
      [BattleFormat.TRIPLE, "triple"],
    ] as const
  ) {
    const message = createMessage();
    message.format = wire;
    assertEquals(decodeCreateBattle(message).format, domain);
  }
});

Deno.test("decodeCreateBattle rejects mode, format, controller, side, and uint violations", () => {
  const mutations: Array<(message: ReturnType<typeof createMessage>) => void> = [
    (message) => message.modeId = "other",
    (message) => message.format = BattleFormat.UNSPECIFIED,
    (message) => message.format = BattleFormat.MULTI,
    (message) => message.format = 99 as BattleFormat,
    (message) => message.controllers.pop(),
    (message) => message.controllers[1].id = "alice",
    (message) => message.controllers[1].side = Side.ZERO,
    (message) => message.controllers[1].side = Side.UNSPECIFIED,
    (message) => message.controllers[1].side = 99 as Side,
    (message) => message.seed = -1,
    (message) => message.seed = Number.NaN,
  ];
  for (const mutate of mutations) {
    const message = createMessage();
    mutate(message);
    assertThrows(() => decodeCreateBattle(message), WireAdapterError);
  }
});

Deno.test("decodeTeam rejects malformed teams and illegal optional values", () => {
  const malformed = [
    { ...team(), schema: "other" },
    { ...team(), gen: 4 },
    { ...team(), name: "" },
    { ...team(), members: [] },
    { ...team(), members: [{ ...team().members[0], species: "" }] },
    { ...team(), members: [{ ...team().members[0], ability: "" }] },
    { ...team(), members: [{ ...team().members[0], nature: "" }] },
    { ...team(), members: [{ ...team().members[0], moves: [] }] },
    { ...team(), members: [{ ...team().members[0], gender: Gender.UNSPECIFIED }] },
    { ...team(), members: [{ ...team().members[0], gender: 99 as Gender }] },
    { ...team(), members: [{ ...team().members[0], level: Infinity }] },
    { ...team(), members: [{ ...team().members[0], happiness: 0x1_0000_0000 }] },
    { ...team(), members: [{ ...team().members[0], evs: { hp: -1 } }] },
  ];
  assertThrows(() => decodeTeam(undefined), WireAdapterError);
  for (const value of malformed) {
    assertThrows(
      () => decodeTeam(create(PhfTeamSchema, value)),
      WireAdapterError,
    );
  }
});

Deno.test("decodeTeam preserves absent member fields", () => {
  const decoded = decodeTeam(create(PhfTeamSchema, {
    schema: "phf-team/1",
    name: "Minimal",
    gen: 5,
    members: [{ species: "Ditto", ability: "Imposter", nature: "Hardy", moves: ["Transform"] }],
  }));
  assertEquals(decoded, {
    schema: "phf-team/1",
    name: "Minimal",
    gen: 5,
    members: [{ species: "Ditto", ability: "Imposter", nature: "Hardy", moves: ["Transform"] }],
  });
});
