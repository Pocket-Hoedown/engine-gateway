import { assertEquals } from "@std/assert";
import { Protocol } from "@pkmn/protocol";
import { mapEvent, parseIdent } from "../../src/battle/events.ts";

function event(line: string, viewer: 0 | 1 | null = 0) {
  const parsed = Protocol.parseBattleLine(line);
  return mapEvent(parsed.args, parsed.kwArgs, viewer);
}

Deno.test("parseIdent handles active and inactive Pokémon", () => {
  assertEquals(parseIdent("p1a: Pika"), { side: 0, slot: 0, player: "p1", name: "Pika" });
  assertEquals(parseIdent("p2b: Foo"), { side: 1, slot: 1, player: "p2", name: "Foo" });
  assertEquals(parseIdent("p2c: Bar"), { side: 1, slot: 2, player: "p2", name: "Bar" });
  assertEquals(parseIdent("p1: Bench"), { side: 0, slot: null, player: "p1", name: "Bench" });
  assertEquals(parseIdent("bad"), null);
});

Deno.test("mapEvent maps battle narration", () => {
  assertEquals(event("|turn|3"), { type: "turn", turn: 3 });
  assertEquals(event("|switch|p1a: Pika|Pikachu, L50, M|120/120"), {
    type: "switch",
    side: 0,
    slot: 0,
    ident: "p1a: Pika",
    speciesForme: "Pikachu",
    dragged: false,
  });
  assertEquals(event("|drag|p2b: Foo|Snorlax, L50, M|100/100"), {
    type: "switch",
    side: 1,
    slot: 1,
    ident: "p2b: Foo",
    speciesForme: "Snorlax",
    dragged: true,
  });
  assertEquals(event("|move|p1a: Pika|Thunderbolt|p2a: Foo|[from] ability: Magic Bounce|[miss]"), {
    type: "move",
    source: { side: 0, slot: 0, player: "p1", name: "Pika" },
    move: "Thunderbolt",
    target: { side: 1, slot: 0, player: "p2", name: "Foo" },
    miss: true,
    from: "ability: Magic Bounce",
  });
  assertEquals(event("|move|p1a: Pika|Splash|null"), {
    type: "move",
    source: { side: 0, slot: 0, player: "p1", name: "Pika" },
    move: "Splash",
    target: null,
    miss: false,
  });
  assertEquals(event("|faint|p2a: Foo")?.type, "faint");
  assertEquals(event("|-status|p2a: Foo|par")?.type, "status");
  assertEquals(event("|-curestatus|p2a: Foo|par")?.type, "curestatus");
  assertEquals(event("|-boost|p1a: Pika|spa|2")?.type, "boost");
  assertEquals(event("|-unboost|p1a: Pika|def|1")?.type, "unboost");
  assertEquals(event("|-setboost|p1a: Pika|spe|4"), {
    type: "setboost",
    target: { side: 0, slot: 0, player: "p1", name: "Pika" },
    stat: "spe",
    value: 4,
  });
  assertEquals(event("|-supereffective|p2a: Foo")?.type, "effectiveness");
  assertEquals(event("|-resisted|p2a: Foo")?.type, "effectiveness");
  assertEquals(event("|-immune|p2a: Foo")?.type, "effectiveness");
  assertEquals(event("|-crit|p2a: Foo")?.type, "effectiveness");
  assertEquals(event("|cant|p1a: Pika|par|Thunderbolt"), {
    type: "cant",
    target: { side: 0, slot: 0, player: "p1", name: "Pika" },
    reason: "par",
    move: "Thunderbolt",
  });
});

Deno.test("mapEvent normalizes health for each viewer", () => {
  assertEquals(event("|-damage|p2a: Foo|48/200 brn|[from] brn", 0), {
    type: "damage",
    target: { side: 1, slot: 0, player: "p2", name: "Foo" },
    hp: 24,
    maxhp: 100,
    hpIsPercent: true,
    status: "brn",
    from: "brn",
  });
  assertEquals(event("|-heal|p2a: Foo|80/200", 1), {
    type: "heal",
    target: { side: 1, slot: 0, player: "p2", name: "Foo" },
    hp: 80,
    maxhp: 200,
    hpIsPercent: false,
    status: null,
  });
  assertEquals(event("|-damage|p2a: Foo|75/200", null), {
    type: "damage",
    target: { side: 1, slot: 0, player: "p2", name: "Foo" },
    hp: 75,
    maxhp: 200,
    hpIsPercent: false,
    status: null,
  });
});

Deno.test("mapEvent maps field, side, reveal, and volatile events", () => {
  assertEquals(event("|-weather|RainDance|[upkeep]"), {
    type: "weather",
    weather: "RainDance",
    upkeep: true,
  });
  assertEquals(event("|-weather|none"), { type: "weather", weather: null, upkeep: false });
  assertEquals(event("|-sidestart|p1: Alice|move: Reflect"), {
    type: "sidecondition",
    side: 0,
    id: "reflect",
    name: "Reflect",
    ended: false,
  });
  assertEquals(event("|-sideend|p2: Bob|Spikes")?.type, "sidecondition");
  assertEquals(event("|-fieldstart|move: Trick Room"), {
    type: "fieldcondition",
    id: "trickroom",
    name: "Trick Room",
    ended: false,
  });
  assertEquals(event("|-fieldend|move: Trick Room")?.type, "fieldcondition");
  assertEquals(event("|-ability|p1a: Pika|Static")?.type, "reveal");
  assertEquals(event("|-item|p1a: Pika|Light Ball")?.type, "reveal");
  assertEquals(event("|-enditem|p1a: Pika|Light Ball")?.type, "reveal");
  assertEquals(event("|-start|p1a: Pika|Substitute"), {
    type: "volatile",
    target: { side: 0, slot: 0, player: "p1", name: "Pika" },
    id: "substitute",
    name: "Substitute",
    ended: false,
  });
  assertEquals(event("|-end|p1a: Pika|Substitute")?.type, "volatile");
  assertEquals(event("|-activate|p1a: Pika|Confusion")?.type, "volatile");
});

Deno.test("mapEvent drops plumbing and preserves unknown keyword arguments", () => {
  assertEquals(event("|request|{}"), null);
  assertEquals(event("|upkeep"), null);
  assertEquals(event("|t:|123"), null);
  assertEquals(event("|message|hello|[from] move: Test|[silent]"), {
    type: "raw",
    name: "message",
    args: ["hello"],
    kwArgs: { from: "move: Test", silent: true },
  });
});

Deno.test("mapEvent degrades malformed modeled messages to raw", () => {
  assertEquals(event("|move|bad|Thunderbolt|p2a: Foo"), {
    type: "raw",
    name: "move",
    args: ["bad", "Thunderbolt", "p2a: Foo"],
    kwArgs: {},
  });
  assertEquals(event("|-damage|p2a: Foo|bad"), {
    type: "raw",
    name: "-damage",
    args: ["p2a: Foo", "bad"],
    kwArgs: {},
  });
  for (
    const line of [
      "|turn|not-a-number",
      "|-boost|p1a: Pika|atk|NaN",
      "|-unboost|p1a: Pika|def|Infinity",
      "|-setboost|p1a: Pika|spe|invalid",
    ]
  ) {
    assertEquals(event(line)?.type, "raw");
  }
});
