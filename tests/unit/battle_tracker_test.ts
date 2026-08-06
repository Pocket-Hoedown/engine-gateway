import { assert, assertEquals, assertExists, assertNotStrictEquals } from "@std/assert";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { StateTracker } from "../../src/battle/tracker.ts";
import type { BattleState, SideState } from "../../src/battle/state.ts";

function tracker(viewer: 0 | 1 | null = 0): StateTracker {
  return new StateTracker(viewer, new Generations(Dex));
}

function requestLine(
  player: "p1" | "p2",
  active: 0 | 1,
  hp: [number, number],
): string {
  const ownP1 = player === "p1";
  const pokemon = ownP1
    ? [
      {
        ident: "p1: Sparky",
        details: "Pikachu, L50, M",
        condition: active === 0 ? `${hp[0]}/${hp[1]}` : "120/120",
        active: active === 0,
        stats: { atk: 80, def: 60, spa: 90, spd: 70, spe: 110 },
        moves: ["thunderbolt", "quickattack"],
        baseAbility: "static",
        ability: "static",
        item: "lightball",
        pokeball: "pokeball",
      },
      {
        ident: "p1: Shell",
        details: "Blastoise, L50, F",
        condition: active === 1 ? `${hp[0]}/${hp[1]}` : "150/150",
        active: active === 1,
        stats: { atk: 90, def: 120, spa: 110, spd: 120, spe: 80 },
        moves: ["surf", "protect"],
        baseAbility: "torrent",
        ability: "torrent",
        item: "leftovers",
        pokeball: "pokeball",
      },
    ]
    : [
      {
        ident: "p2: Tank",
        details: "Snorlax, L50, M",
        condition: `${hp[0]}/${hp[1]}`,
        active: true,
        stats: { atk: 130, def: 90, spa: 70, spd: 130, spe: 50 },
        moves: ["bodyslam", "rest"],
        baseAbility: "thickfat",
        ability: "thickfat",
        item: "chestoberry",
        pokeball: "pokeball",
      },
      {
        ident: "p2: Star",
        details: "Starmie, L50",
        condition: "130/130",
        active: false,
        stats: { atk: 70, def: 90, spa: 130, spd: 90, spe: 130 },
        moves: ["surf", "recover"],
        baseAbility: "naturalcure",
        ability: "naturalcure",
        item: "lifeorb",
        pokeball: "pokeball",
      },
    ];
  if (ownP1 && active === 1) pokemon.reverse();
  const moves = ownP1
    ? active === 0
      ? [
        {
          move: "Thunderbolt",
          id: "thunderbolt",
          pp: 23,
          maxpp: 24,
          target: "normal",
          disabled: false,
        },
        {
          move: "Quick Attack",
          id: "quickattack",
          pp: 48,
          maxpp: 48,
          target: "normal",
          disabled: false,
        },
      ]
      : [
        {
          move: "Surf",
          id: "surf",
          pp: 23,
          maxpp: 24,
          target: "allAdjacent",
          disabled: false,
        },
        {
          move: "Protect",
          id: "protect",
          pp: 16,
          maxpp: 16,
          target: "self",
          disabled: false,
        },
      ]
    : [
      {
        move: "Body Slam",
        id: "bodyslam",
        pp: 23,
        maxpp: 24,
        target: "normal",
        disabled: false,
      },
      {
        move: "Rest",
        id: "rest",
        pp: 16,
        maxpp: 16,
        target: "self",
        disabled: false,
      },
    ];
  return `|request|${
    JSON.stringify({
      active: [{ moves }],
      side: { id: player, name: ownP1 ? "Alice" : "Bob", pokemon },
    })
  }`;
}

function metadata(gameType: "singles" | "doubles" | "triples" = "singles"): string[] {
  return [
    "|gen|5",
    `|gametype|${gameType}`,
    "|player|p1|Alice|1",
    "|player|p2|Bob|2",
    "|teamsize|p1|2",
    "|teamsize|p2|2",
    "|poke|p1|Pikachu, L50, M",
    "|poke|p1|Blastoise, L50, F",
    "|poke|p2|Snorlax, L50, M",
    "|poke|p2|Starmie, L50",
    "|teampreview|2",
  ];
}

function active(side: SideState, slot = 0) {
  const pokemon = side.active[slot];
  assertExists(pokemon);
  return pokemon;
}

Deno.test("StateTracker projects metadata, preview health, phases, and fresh states", () => {
  const stateTracker = tracker(0);
  const preview = stateTracker.ingest(metadata()).state;
  assertEquals(preview.turn, 0);
  assertEquals(preview.gameType, "singles");
  assertEquals(preview.phase, "teampreview");
  assertEquals(preview.viewer, 0);
  assertEquals(preview.sides.map((side) => [side.side, side.player, side.name]), [
    [0, "p1", "Alice"],
    [1, "p2", "Bob"],
  ]);
  assertEquals(preview.sides[0].active, [null]);
  assertEquals(preview.sides[0].team.length, 2);
  assertEquals(preview.sides[1].team[0].hp, 100);
  assertEquals(preview.sides[1].team[0].maxhp, 100);
  assertEquals(preview.sides[1].team[0].hpIsPercent, true);
  assertEquals(preview.sides[1].team[1].gender, "");

  const started = stateTracker.ingest(["|start", "|turn|1"]).state;
  assertEquals(started.phase, "battle");
  assertEquals(started.turn, 1);
  const ended = stateTracker.ingest(["|win|Alice"]).state;
  assertEquals(ended.phase, "ended");

  ended.sides[0].name = "changed";
  const fresh = stateTracker.ingest([]).state;
  assertNotStrictEquals(fresh, ended);
  assertNotStrictEquals(fresh.sides[0], ended.sides[0]);
  assertEquals(fresh.sides[0].name, "Alice");
});

Deno.test("StateTracker creates the correct active slot count for each Gen 5 game type", () => {
  for (const [gameType, count] of [["singles", 1], ["doubles", 2], ["triples", 3]] as const) {
    const state = tracker().ingest(metadata(gameType)).state;
    assertEquals(state.gameType, gameType);
    assertEquals(state.sides[0].active.length, count);
    assertEquals(state.sides[1].active.length, count);
  }
});

Deno.test("StateTracker projects battle changes, revealed sets, and preserved bench knowledge", () => {
  const stateTracker = tracker(0);
  stateTracker.ingest([
    ...metadata(),
    requestLine("p1", 0, [120, 120]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    "|switch|p2a: Tank|Snorlax, L50, M|100/100",
  ]);

  let result = stateTracker.ingest([
    "|turn|1",
    "|move|p1a: Sparky|Thunderbolt|p2a: Tank",
    "|-damage|p2a: Tank|67/100 par",
    "|-status|p2a: Tank|par",
    "|-boost|p1a: Sparky|spa|2",
    "|-setboost|p1a: Sparky|spa|1",
    "|-ability|p2a: Tank|Thick Fat",
    "|-item|p2a: Tank|Chesto Berry",
    "|move|p2a: Tank|Body Slam|p1a: Sparky",
  ]);
  let own = active(result.state.sides[0]);
  let foe = active(result.state.sides[1]);
  assertEquals(own.ident, "p1a: Sparky");
  assertEquals(own.speciesForme, "Pikachu");
  assertEquals(own.level, 50);
  assertEquals(own.gender, "M");
  assertEquals(own.hp, 120);
  assertEquals(own.maxhp, 120);
  assertEquals(own.hpIsPercent, false);
  assertEquals(own.boosts, { spa: 1 });
  assertEquals(own.ability, "static");
  assertEquals(own.item, "lightball");
  assertEquals(own.moves[0], { id: "thunderbolt", name: "Thunderbolt", pp: 23, maxpp: 24 });
  assertEquals(own.lastMove, "thunderbolt");
  assertEquals(foe.hp, 67);
  assertEquals(foe.maxhp, 100);
  assertEquals(foe.hpIsPercent, true);
  assertEquals(foe.status, "par");
  assertEquals(foe.ability, "thickfat");
  assertEquals(foe.item, "chestoberry");
  assertEquals(foe.moves, [{ id: "bodyslam", name: "Body Slam" }]);
  assertEquals(foe.lastMove, "bodyslam");
  assertEquals(result.events.filter((event) => event.type === "move").length, 2);

  result = stateTracker.ingest([
    "|-heal|p2a: Tank|80/100 par",
    "|-curestatus|p2a: Tank|par",
    "|switch|p1a: Shell|Blastoise, L50, F|150/150",
    requestLine("p1", 1, [150, 150]),
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    requestLine("p1", 0, [120, 120]),
  ]);
  own = active(result.state.sides[0]);
  foe = active(result.state.sides[1]);
  assertEquals(foe.hp, 80);
  assertEquals(foe.status, null);
  assertEquals(own.ident, "p1a: Sparky");
  assertEquals(result.state.sides[0].team.length, 1);
  const bench = result.state.sides[0].team[0];
  assertEquals(bench.ident, "p1: Shell");
  assertEquals(bench.speciesForme, "Blastoise");
  assertEquals(bench.ability, "torrent");
  assertEquals(bench.item, "leftovers");
  assertEquals(bench.moves[0], { id: "surf", name: "Surf", pp: 23, maxpp: 24 });
});

Deno.test("StateTracker projects field conditions, hazards, screens, and all volatiles", () => {
  const stateTracker = tracker(null);
  const state = stateTracker.ingest([
    ...metadata(),
    requestLine("p1", 0, [120, 120]),
    requestLine("p2", 0, [200, 200]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    "|switch|p2a: Tank|Snorlax, L50, M|200/200",
    "|-weather|Hail",
    "|-fieldstart|move: Trick Room",
    "|-fieldstart|move: Gravity",
    "|-sidestart|p1: Alice|Spikes",
    "|-sidestart|p1: Alice|Spikes",
    "|-sidestart|p1: Alice|Stealth Rock",
    "|-sidestart|p1: Alice|Reflect",
    "|-sidestart|p1: Alice|Tailwind",
    "|-start|p1a: Sparky|Substitute",
    "|-start|p1a: Sparky|Confusion",
  ]).state;

  assertEquals(state.weather, {
    id: "hail",
    name: "Hail",
    minTurnsLeft: 5,
    maxTurnsLeft: 8,
  });
  assertEquals(state.pseudoWeather, [
    { id: "trickroom", name: "Trick Room", minTurnsLeft: 5 },
    { id: "gravity", name: "Gravity", minTurnsLeft: 5 },
  ]);
  assertEquals(state.sides[0].hazards, [
    { id: "spikes", name: "Spikes", layers: 2 },
    { id: "stealthrock", name: "Stealth Rock", layers: 1 },
  ]);
  assertEquals(state.sides[0].screens, [
    { id: "reflect", name: "Reflect", minTurnsLeft: 5, maxTurnsLeft: 8 },
    { id: "tailwind", name: "Tailwind", minTurnsLeft: 4 },
  ]);
  assertEquals(active(state.sides[0]).volatiles, [
    { id: "substitute", name: "Substitute" },
    { id: "confusion", name: "confusion" },
  ]);

  const afterUpkeep = stateTracker.ingest(["|upkeep"]).state;
  assertEquals(afterUpkeep.pseudoWeather[0].minTurnsLeft, 4);
  assertEquals(afterUpkeep.sides[0].screens[0], {
    id: "reflect",
    name: "Reflect",
    minTurnsLeft: 4,
    maxTurnsLeft: 7,
  });
  assertEquals(afterUpkeep.sides[0].screens[1].minTurnsLeft, 3);

  const cleared = stateTracker.ingest([
    "|-weather|none",
    "|-fieldend|move: Trick Room",
    "|-sideend|p1: Alice|Reflect",
    "|-end|p1a: Sparky|Substitute",
  ]).state;
  assertEquals(cleared.weather, null);
  assertEquals(cleared.pseudoWeather.map((condition) => condition.id), ["gravity"]);
  assertEquals(cleared.sides[0].screens.map((condition) => condition.id), ["tailwind"]);
  assertEquals(active(cleared.sides[0]).volatiles.map((condition) => condition.id), ["confusion"]);
});

Deno.test("StateTracker scopes private requests and HP for p1, p2, and spectator viewers", () => {
  const publicStart = metadata();
  const p1 = tracker(0).ingest([
    ...publicStart,
    requestLine("p1", 0, [120, 120]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    "|switch|p2a: Tank|Snorlax, L50, M|100/100",
    "|-damage|p2a: Tank|75/100",
  ]).state;
  const p2 = tracker(1).ingest([
    ...publicStart,
    requestLine("p2", 0, [200, 200]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|100/100",
    "|switch|p2a: Tank|Snorlax, L50, M|200/200",
    "|-damage|p1a: Sparky|75/100",
  ]).state;
  const spectator = tracker(null).ingest([
    ...publicStart,
    requestLine("p1", 0, [120, 120]),
    requestLine("p2", 0, [200, 200]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    "|switch|p2a: Tank|Snorlax, L50, M|200/200",
    "|-damage|p1a: Sparky|90/120",
    "|-damage|p2a: Tank|150/200",
  ]).state;

  assertEquals(active(p1.sides[0]).hp, 120);
  assertEquals(active(p1.sides[0]).maxhp, 120);
  assertEquals(active(p1.sides[0]).ability, "static");
  assertEquals(active(p1.sides[1]).hp, 75);
  assertEquals(active(p1.sides[1]).maxhp, 100);
  assertEquals(active(p1.sides[1]).hpIsPercent, true);
  assertEquals(active(p1.sides[1]).ability, null);
  assertEquals(active(p1.sides[1]).item, null);
  assertEquals(active(p1.sides[1]).moves, []);

  assertEquals(active(p2.sides[0]).hp, 75);
  assertEquals(active(p2.sides[0]).maxhp, 100);
  assertEquals(active(p2.sides[0]).ability, null);
  assertEquals(active(p2.sides[1]).hp, 200);
  assertEquals(active(p2.sides[1]).maxhp, 200);
  assertEquals(active(p2.sides[1]).ability, "thickfat");
  assertEquals(active(p2.sides[1]).moves[0].pp, 23);

  assertEquals(active(spectator.sides[0]).hp, 90);
  assertEquals(active(spectator.sides[0]).maxhp, 120);
  assertEquals(active(spectator.sides[0]).hpIsPercent, false);
  assertEquals(active(spectator.sides[1]).hp, 150);
  assertEquals(active(spectator.sides[1]).maxhp, 200);
  assertEquals(active(spectator.sides[1]).hpIsPercent, false);
  assertEquals(active(spectator.sides[0]).ability, "static");
  assertEquals(active(spectator.sides[1]).ability, "thickfat");
});

Deno.test("StateTracker handles fainting and keeps settled event order", () => {
  const stateTracker = tracker(null);
  stateTracker.ingest([
    ...metadata(),
    requestLine("p1", 0, [120, 120]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
    "|switch|p2a: Tank|Snorlax, L50, M|200/200",
  ]);
  const result = stateTracker.ingest([
    "|turn|3",
    "|move|p1a: Sparky|Thunderbolt|p2a: Tank",
    "|-damage|p2a: Tank|0 fnt",
    "|faint|p2a: Tank",
  ]);
  assertEquals(result.events.map((event) => event.type), ["turn", "move", "damage", "faint"]);
  assertEquals(result.state.turn, 3);
  const damage = result.events.find((event) => event.type === "damage");
  assertExists(damage);
  if (damage.type === "damage") {
    assertEquals(damage.maxhp, 200);
    assertEquals(damage.hpIsPercent, false);
  }
  assertEquals(result.state.sides[1].active, [null]);
  const fainted = result.state.sides[1].team.find((pokemon) => pokemon.ident === "p2: Tank");
  assertExists(fainted);
  assertEquals(fainted.hp, 0);
  assertEquals(fainted.maxhp, 200);
  assertEquals(fainted.fainted, true);
});

Deno.test("StateTracker isolates unknown and malformed lines and returns JSON-only state", () => {
  const stateTracker = tracker(0);
  stateTracker.ingest([
    ...metadata(),
    requestLine("p1", 0, [120, 120]),
    "|start",
    "|switch|p1a: Sparky|Pikachu, L50, M|120/120",
  ]);
  const result = stateTracker.ingest([
    "|message|hello",
    "|move|not-an-ident|Thunderbolt|p2a: Missing",
    "|-damage|p2a: Missing|bad-health",
    "not protocol",
    "|turn|4",
  ]);
  assertEquals(result.state.turn, 4);
  assert(result.events.some((event) => event.type === "raw"));
  assertEquals(result.events.at(-1)?.type, "turn");

  const json = JSON.stringify(result.state);
  assert(!json.includes('"dex"'));
  assert(!json.includes('"gen"'));
  assertEquals(JSON.parse(json), result.state);
});

Deno.test("StateTracker projects no unknown duration bounds and remains forced to Gen 5", () => {
  const stateTracker = tracker();
  const state = stateTracker.ingest([
    ...metadata(),
    "|gen|9",
    "|-sidestart|p1: Alice|Tailwind",
    "|-sidestart|p1: Alice|Spikes",
  ]).state;
  assertEquals(state.sides[0].screens, [
    { id: "tailwind", name: "Tailwind", minTurnsLeft: 4 },
  ]);
  assertEquals(state.sides[0].hazards, [{ id: "spikes", name: "Spikes", layers: 1 }]);
  assertEquals(Object.values(state.sides[0].hazards[0]).includes(0), false);
});

function cloneState(state: BattleState): BattleState {
  return JSON.parse(JSON.stringify(state));
}

Deno.test("StateTracker returns independent JSON projections across calls", () => {
  const stateTracker = tracker();
  const first = stateTracker.ingest(metadata()).state;
  const copy = cloneState(first);
  first.sides[0].team.length = 0;
  assertEquals(stateTracker.ingest([]).state, copy);
});

Deno.test("StateTracker can terminate a stream without inventing protocol", () => {
  const stateTracker = tracker();
  stateTracker.ingest(metadata());
  assertEquals(stateTracker.end().phase, "ended");
});
