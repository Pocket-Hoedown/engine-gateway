import type { Ref, SemanticEvent } from "./events.ts";
import type { BattleState, ConditionState, PokemonHealthState, SideState } from "./state.ts";

function percent(hp: number, maxhp: number): number {
  return maxhp > 0 ? Math.max(0, Math.min(100, Math.ceil(hp * 100 / maxhp))) : 0;
}

// Match the complete health field, not an integer prefix of a decimal token.
// Unknown/malformed health is dropped rather than forwarded through a raw fallback.
function healthToken(token: string): string | null {
  const match =
    /^(\d+(?:\.\d*)?|\.\d+)(?:\/(\d+(?:\.\d*)?|\.\d+)[gyr]?)?(?: (par|brn|slp|psn|tox|frz|fnt))?$/
      .exec(
        token,
      );
  if (!match) return null;
  const hp = Number(match[1]);
  // The installed parser interprets bare numbers as percentages and fnt as
  // authoritative zero HP. Color hints are public, but redundant after scaling.
  const maxhp = match[2] === undefined ? 100 : Number(match[2]);
  const status = match[3] ? ` ${match[3]}` : "";
  if (!Number.isFinite(hp) || !Number.isFinite(maxhp) || maxhp <= 0) return null;
  if (match[2] === undefined && hp === 0) return `0${status}`;
  return `${percent(match[3] === "fnt" ? 0 : hp, maxhp)}/100${status}`;
}

function publicArgs(name: string, input: string[]): string[] | null {
  if (name === "request" || name === "error" || name === "sideupdate") return null;
  const args = [...input];
  const indexes = name === "switch" || name === "drag" || name === "replace"
    ? [2]
    : name === "-damage" || name === "-heal"
    ? [1]
    : [];
  if (name === "-sethp") {
    for (let i = 0; i < args.length && !args[i].startsWith("["); i += 2) {
      indexes.push(i + 1);
    }
    if (!indexes.length) return null;
  }
  for (const index of indexes) {
    const projected = healthToken(args[index] ?? "");
    if (projected === null) return null;
    args[index] = projected;
  }
  return args;
}

// Custom Game can expose exact HP even on the simulator spectator stream.
// Project protocol health fields before tracking, so raw fallback events are safe too.
export function spectatorSafeLines(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const [prefix, name, ...input] = line.split("|");
    const args = publicArgs(name, input);
    return args === null ? [] : [[prefix, name, ...args].join("|")];
  });
}

function health(p: PokemonHealthState) {
  return {
    ident: p.ident,
    speciesForme: p.speciesForme,
    level: p.level,
    gender: p.gender,
    hp: percent(p.hp, p.maxhp),
    maxhp: 100,
    hpIsPercent: true,
    fainted: p.fainted,
    status: p.status,
    ability: null,
    item: null,
    moves: [],
  };
}

function condition(c: ConditionState): ConditionState {
  return { id: c.id, name: c.name, minTurnsLeft: c.minTurnsLeft, maxTurnsLeft: c.maxTurnsLeft };
}

function side(s: SideState): SideState {
  return {
    side: s.side,
    player: s.player,
    name: s.name,
    team: s.team.map(health),
    active: s.active.map((p) =>
      p === null ? null : ({
        ...health(p),
        boosts: Object.fromEntries(
          (["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"] as const)
            .flatMap((stat) => p.boosts[stat] === undefined ? [] : [[stat, p.boosts[stat]]]),
        ),
        volatiles: p.volatiles.map((v) => ({ id: v.id, name: v.name, level: v.level })),
        lastMove: p.lastMove,
      })
    ),
    hazards: s.hazards.map((h) => ({ id: h.id, name: h.name, layers: h.layers })),
    screens: s.screens.map(condition),
  };
}

// The input must be tracked exclusively from public simulator lines. Projection cannot
// infer whether a nickname, species or volatile originated in a private request.
export function spectatorSafeState(state: BattleState): BattleState {
  return {
    turn: state.turn,
    gameType: state.gameType,
    phase: state.phase,
    viewer: null,
    weather: state.weather ? condition(state.weather) : null,
    pseudoWeather: state.pseudoWeather.map(condition),
    sides: [side(state.sides[0]), side(state.sides[1])],
  };
}

function ref(r: Ref): Ref {
  return { side: r.side, slot: r.slot, player: r.player, name: r.name };
}

// Events originate only in public lines, never initialized team sets or requests.
export function spectatorSafeEvents(events: SemanticEvent[]): SemanticEvent[] {
  return events.flatMap((e): SemanticEvent[] => {
    switch (e.type) {
      case "damage":
      case "heal":
        return [{
          type: e.type,
          target: ref(e.target),
          hp: percent(e.hp, e.maxhp),
          maxhp: 100,
          hpIsPercent: true,
          status: e.status,
          from: e.from,
        }];
      case "turn":
        return [{ type: e.type, turn: e.turn }];
      case "switch":
        return [{
          type: e.type,
          side: e.side,
          slot: e.slot,
          ident: e.ident,
          speciesForme: e.speciesForme,
          dragged: e.dragged,
        }];
      case "move":
        return [{
          type: e.type,
          source: ref(e.source),
          move: e.move,
          target: e.target ? ref(e.target) : null,
          miss: e.miss,
          from: e.from,
        }];
      case "faint":
        return [{ type: e.type, target: ref(e.target) }];
      case "status":
      case "curestatus":
        return [{ type: e.type, target: ref(e.target), status: e.status }];
      case "boost":
      case "unboost":
        return [{ type: e.type, target: ref(e.target), stat: e.stat, amount: e.amount }];
      case "setboost":
        return [{ type: e.type, target: ref(e.target), stat: e.stat, value: e.value }];
      case "effectiveness":
        return [{ type: e.type, target: ref(e.target), kind: e.kind }];
      case "weather":
        return [{ type: e.type, weather: e.weather, upkeep: e.upkeep }];
      case "sidecondition":
        return [{ type: e.type, side: e.side, id: e.id, name: e.name, ended: e.ended }];
      case "fieldcondition":
        return [{ type: e.type, id: e.id, name: e.name, ended: e.ended }];
      case "reveal":
        return [{ type: e.type, target: ref(e.target), what: e.what, value: e.value }];
      case "volatile":
        return [{ type: e.type, target: ref(e.target), id: e.id, name: e.name, ended: e.ended }];
      case "cant":
        return [{ type: e.type, target: ref(e.target), reason: e.reason, move: e.move }];
      case "raw": {
        const args = publicArgs(e.name, e.args);
        if (args === null) return [];
        return [{
          type: e.type,
          name: e.name,
          args,
          kwArgs: Object.fromEntries(Object.entries(e.kwArgs)),
        }];
      }
    }
  });
}
