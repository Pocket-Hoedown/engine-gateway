import { assert, assertEquals } from "@std/assert";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { encodeState } from "../../src/ws/encode.ts";
import { StateTracker } from "../../src/battle/tracker.ts";
import {
  spectatorSafeEvents,
  spectatorSafeLines,
  spectatorSafeState,
} from "../../src/battle/visibility.ts";

Deno.test("spectator lines redact exact HP including multi-target sethp", () => {
  assertEquals(
    spectatorSafeLines([
      '|request|{"item":"Choice Band"}',
      "|switch|p1a: Pikachu|Pikachu, M|123/211 par",
      "|-sethp|p1a: Pikachu|123/211|p2a: Rattata|1/200",
      "|-damage|p1a: Pikachu|0 fnt",
      "|-ability|p1a: Pikachu|Static",
    ]),
    [
      "|switch|p1a: Pikachu|Pikachu, M|59/100 par",
      "|-sethp|p1a: Pikachu|59/100|p2a: Rattata|1/100",
      "|-damage|p1a: Pikachu|0 fnt",
      "|-ability|p1a: Pikachu|Static",
    ],
  );
});

Deno.test("spectator projection removes private sets and rounds health up", () => {
  const tracker = new StateTracker(null, new Generations(Dex));
  tracker.initialize("singles", [["Pikachu"], ["Rattata"]]);
  const { state } = tracker.ingest(["|switch|p1a: Pikachu|Pikachu, L100, M|123/211"]);
  const pokemon = state.sides[0].active[0]!;
  pokemon.item = "Choice Band";
  pokemon.ability = "Secret Ability";
  pokemon.moves = [{ id: "hiddenmove", name: "Hidden Move", pp: 7 }];
  const projected = spectatorSafeState(state);
  encodeState(projected);
  const output = JSON.stringify(projected);
  for (const secret of ["Choice Band", "Secret Ability", "hiddenmove", "123", "211"]) {
    assert(!output.includes(secret), secret);
  }
  assertEquals(projected.sides[0].active[0]?.hp, 59);
  assertEquals(projected.sides[0].active[0]?.maxhp, 100);
  assertEquals(pokemon.item, "Choice Band");
});

Deno.test("spectator events preserve public reveals but never requests or exact health", () => {
  const target = { side: 0 as const, slot: 0, player: "p1" as const, name: "Pikachu" };
  assertEquals(
    spectatorSafeEvents([
      { type: "raw", name: "request", args: ['{"item":"Choice Band"}'], kwArgs: {} },
      { type: "damage", target, hp: 123, maxhp: 211, hpIsPercent: false, status: null },
      { type: "reveal", target, what: "ability", value: "Static" },
    ]),
    [
      {
        type: "damage",
        target,
        hp: 59,
        maxhp: 100,
        hpIsPercent: true,
        status: null,
        from: undefined,
      },
      { type: "reveal", target, what: "ability", value: "Static" },
    ],
  );
});
