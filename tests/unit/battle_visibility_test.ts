import { assert, assertEquals } from "@std/assert";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { Protocol } from "@pkmn/protocol";
import { encodeState } from "../../src/ws/encode.ts";
import { StateTracker } from "../../src/battle/tracker.ts";
import {
  spectatorSafeEvents,
  spectatorSafeLines,
  spectatorSafeState,
} from "../../src/battle/visibility.ts";

Deno.test("spectator health tokens are parsed completely in lines and raw events", () => {
  const cases: Array<[string, string | null]> = [
    ["50", "50/100"],
    ["50.5 par", "51/100 par"],
    ["24/48y", "50/100"],
    ["36/48g brn", "75/100 brn"],
    ["9/48r", "19/100"],
    ["24.5/48.5y tox", "51/100 tox"],
    ["0/48r fnt", "0/100 fnt"],
    ["50 fnt", "0/100 fnt"],
    ["24/48y fnt", "0/100 fnt"],
    ["50.5junk", null],
    ["24/48yellow", null],
    ["24/48yg", null],
    ["24/48y par trailing", null],
    ["123.5/211.5 par", "59/100 par"],
    ["1/200.5", "1/100"],
    [".5/2.5 brn", "20/100 brn"],
    ["1./2. slp", "50/100 slp"],
    ["0/211.5 fnt", "0/100 fnt"],
    ["0 fnt", "0 fnt"],
    ["7/100 tox", "7/100 tox"],
    ["1/2 psn", "50/100 psn"],
    ["1/2 frz", "50/100 frz"],
    ["123/211.5junk", null],
    ["123/0", null],
    ["NaN/211", null],
    ["123/211 Secret", null],
    ["123/211 par trailing", null],
  ];
  for (const [token, expected] of cases) {
    if (expected !== null) {
      const parsed = Protocol.parseHealth(token as never);
      assert(parsed, `installed parser accepts ${token}`);
      assertEquals(Math.ceil(parsed.hp * 100 / parsed.maxhp), parseFloat(expected), token);
    }
    for (const name of ["switch", "drag", "replace", "-damage", "-heal", "-sethp"]) {
      const args = ["p1a: Pikachu"];
      if (["switch", "drag", "replace"].includes(name)) args.push("Pikachu, M");
      args.push(token);
      const projected = args.with(args.length - 1, expected ?? "");
      assertEquals(
        spectatorSafeLines([`|${name}|${args.join("|")}`]),
        expected === null ? [] : [`|${name}|${projected.join("|")}`],
        `${name}: ${token}`,
      );
      assertEquals(
        spectatorSafeEvents([{ type: "raw", name, args, kwArgs: {} }]),
        expected === null ? [] : [{ type: "raw", name, args: projected, kwArgs: {} }],
        `${name}: raw ${token}`,
      );
    }
  }
});

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
  const bench = state.sides[1].team[0];
  for (const mon of [pokemon, bench]) {
    mon.hp = 123.5;
    mon.maxhp = 211.5;
    mon.hpIsPercent = false;
    mon.item = "Choice Band";
    mon.ability = "Secret Ability";
    mon.moves = [{ id: "hiddenmove", name: "Hidden Move", pp: 7 }];
  }
  const projected = spectatorSafeState(state);
  encodeState(projected);
  const output = JSON.stringify(projected);
  for (const secret of ["Choice Band", "Secret Ability", "hiddenmove", "123", "211"]) {
    assert(!output.includes(secret), secret);
  }
  for (const mon of [projected.sides[0].active[0]!, projected.sides[1].team[0]]) {
    assertEquals(mon.hp, 59);
    assertEquals(mon.maxhp, 100);
    assertEquals(mon.hpIsPercent, true);
    assertEquals(mon.item, null);
    assertEquals(mon.ability, null);
    assertEquals(mon.moves, []);
  }
  assertEquals(pokemon.item, "Choice Band");
});

Deno.test("spectator events preserve public reveals but never requests or exact health", () => {
  const target = { side: 0 as const, slot: 0, player: "p1" as const, name: "Pikachu" };
  assertEquals(
    spectatorSafeEvents([
      { type: "raw", name: "request", args: ['{"item":"Choice Band"}'], kwArgs: {} },
      { type: "damage", target, hp: 123.5, maxhp: 211.5, hpIsPercent: false, status: null },
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
