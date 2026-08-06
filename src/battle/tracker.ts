import { Battle, type Pokemon, type Side } from "@pkmn/client";
import type { Generation, Generations, PokemonSet } from "@pkmn/data";
import { Protocol } from "@pkmn/protocol";
import { mapEvent, type SemanticEvent } from "./events.ts";
import type {
  ActivePokemon,
  BattleState,
  BenchPokemon,
  BoostStat,
  ConditionState,
  DurationState,
  LayeredConditionState,
  PokemonHealthState,
  PokemonMove,
  SideState,
  WeatherState,
} from "./state.ts";

const BOOST_STATS = new Set<BoostStat>([
  "atk",
  "def",
  "spa",
  "spd",
  "spe",
  "accuracy",
  "evasion",
]);
const HAZARDS = new Set(["spikes", "toxicspikes", "stealthrock"]);
const SCREENS = new Set(["reflect", "lightscreen", "safeguard", "mist", "tailwind"]);

type ParsedLine = ReturnType<typeof Protocol.parseBattleLine>;
type RawKeywordArgs = Record<string, string | true>;

function keywordArgs(value: object): RawKeywordArgs {
  const result: RawKeywordArgs = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === true) result[key] = true;
    else if (raw !== false && raw !== undefined && raw !== null) result[key] = String(raw);
  }
  return result;
}

function rawEvent(name: string, args: readonly unknown[], kwArgs: object): SemanticEvent {
  return {
    type: "raw",
    name,
    args: args.map(String),
    kwArgs: keywordArgs(kwArgs),
  } as SemanticEvent;
}

function rawFromParsed(parsed: ParsedLine): SemanticEvent | null {
  const [name, ...args] = parsed.args;
  return name ? rawEvent(String(name), args, parsed.kwArgs) : null;
}

function rawFromLine(line: string): SemanticEvent | null {
  if (!line.startsWith("|")) return null;
  const fields = line.slice(1).split("|");
  const name = fields.shift();
  if (!name) return null;
  const args: string[] = [];
  const kwArgs: RawKeywordArgs = {};
  for (const field of fields) {
    const match = /^\[([^\]]+)\](?:\s(.*))?$/.exec(field);
    if (!match) {
      args.push(field);
      continue;
    }
    kwArgs[match[1]] = match[2] === undefined || match[2] === "" ? true : match[2];
  }
  return rawEvent(name, args, kwArgs);
}

function duration(minDuration: number, maxDuration: number): DurationState {
  const result: DurationState = {};
  if (Number.isFinite(minDuration) && minDuration > 0) result.minTurnsLeft = minDuration;
  if (Number.isFinite(maxDuration) && maxDuration > 0) result.maxTurnsLeft = maxDuration;
  return result;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export class StateTracker {
  readonly #viewer: 0 | 1 | null;
  readonly #battle: Battle;
  readonly #gen: Generation;
  readonly #sets: Array<PokemonSet[] | undefined>;
  #phase: BattleState["phase"] = "teampreview";

  constructor(
    viewer: 0 | 1 | null,
    gens: Generations,
    sets?: PokemonSet[] | Array<PokemonSet[] | undefined>,
  ) {
    this.#viewer = viewer;
    this.#battle = new Battle(gens, null, sets);
    this.#sets = sets && sets.some(Array.isArray)
      ? sets as Array<PokemonSet[] | undefined>
      : [sets as PokemonSet[] | undefined, undefined];
    this.#gen = gens.get(5);
    this.#battle.gen = this.#gen;
  }

  initialize(gameType: BattleState["gameType"], teams: [string[], string[]]): void {
    this.#battle.add(`|gametype|${gameType}`);
    for (const [side, species] of teams.entries()) {
      const player = side === 0 ? "p1" : "p2";
      this.#battle.add(`|player|${player}|${player.toUpperCase()}`);
      this.#battle.add(`|teamsize|${player}|${species.length}`);
      for (const name of species) this.#battle.add(`|poke|${player}|${name}`);
    }
    this.#battle.gen = this.#gen;
  }

  end(): BattleState {
    this.#phase = "ended";
    return this.#project();
  }

  ingest(lines: string[]): { state: BattleState; events: SemanticEvent[] } {
    const events: SemanticEvent[] = [];
    for (const line of lines) {
      let parsed: ParsedLine;
      try {
        parsed = Protocol.parseBattleLine(line);
      } catch {
        const fallback = rawFromLine(line);
        if (fallback) events.push(fallback);
        continue;
      }

      let mapped = false;
      try {
        const event = this.#resolveEventHealth(
          mapEvent(parsed.args, parsed.kwArgs, this.#viewer),
          parsed,
        );
        if (event) {
          events.push(event);
          mapped = true;
        }
      } catch {
        const fallback = rawFromParsed(parsed);
        if (fallback) {
          events.push(fallback);
          mapped = true;
        }
      }

      const name = String(parsed.args[0] ?? "");
      if (name === "start") this.#phase = "battle";
      else if (name === "win" || name === "tie") this.#phase = "ended";

      try {
        this.#battle.add(parsed.args, parsed.kwArgs);
      } catch {
        if (!mapped) {
          const fallback = rawFromParsed(parsed);
          if (fallback) events.push(fallback);
        }
      } finally {
        this.#battle.gen = this.#gen;
      }
    }
    return { events, state: this.#project() };
  }

  #resolveEventHealth(event: SemanticEvent | null, parsed: ParsedLine): SemanticEvent | null {
    if (!event || (event.type !== "damage" && event.type !== "heal") || event.hpIsPercent) {
      return event;
    }
    const health = String(parsed.args[2] ?? "").split(" ", 1)[0];
    if (health.includes("/")) return event;
    try {
      const pokemon = this.#battle.getPokemon(String(parsed.args[1] ?? "") as never);
      if (pokemon && pokemon.maxhp > 0) return { ...event, maxhp: pokemon.maxhp };
    } catch {
      return event;
    }
    return event;
  }

  #project(): BattleState {
    return {
      turn: finite(this.#battle.turn),
      gameType: this.#gameType(),
      phase: this.#phase,
      viewer: this.#viewer,
      weather: this.#weather(),
      pseudoWeather: Object.entries(this.#battle.field.pseudoWeather).map(([id, state]) => ({
        id,
        name: this.#conditionName(id),
        ...duration(state.minDuration, state.maxDuration),
      })),
      sides: [this.#side(this.#battle.p1, 0), this.#side(this.#battle.p2, 1)],
    };
  }

  #gameType(): BattleState["gameType"] {
    if (this.#battle.gameType === "doubles") return "doubles";
    if (this.#battle.gameType === "triples") return "triples";
    return "singles";
  }

  #weather(): WeatherState | null {
    const state = this.#battle.field.weatherState;
    if (!state.id) return null;
    return {
      id: String(state.id),
      name: this.#battle.field.weather || this.#conditionName(String(state.id)),
      ...duration(state.minDuration, state.maxDuration),
    };
  }

  #side(side: Side, index: 0 | 1): SideState {
    const activeObjects = new Set(
      side.active.filter((pokemon): pokemon is Pokemon => pokemon !== null),
    );
    return {
      side: index,
      player: index === 0 ? "p1" : "p2",
      name: String(side.name),
      active: side.active.map((pokemon) => pokemon ? this.#active(pokemon, index) : null),
      team: side.team
        .filter((pokemon) => !activeObjects.has(pokemon))
        .map((pokemon) => this.#bench(pokemon, index)),
      hazards: this.#hazards(side),
      screens: this.#screens(side),
    };
  }

  #active(pokemon: Pokemon, side: 0 | 1): ActivePokemon {
    const boosts: Partial<Record<BoostStat, number>> = {};
    for (const [stat, value] of Object.entries(pokemon.boosts)) {
      if (BOOST_STATS.has(stat as BoostStat) && typeof value === "number" && value !== 0) {
        boosts[stat as BoostStat] = finite(value);
      }
    }
    return {
      ...this.#health(pokemon, side, String(pokemon.ident)),
      boosts,
      ability: this.#ability(pokemon, side),
      item: pokemon.item || this.#set(pokemon, side)?.item || null,
      moves: this.#moves(pokemon, side),
      volatiles: Object.entries(pokemon.volatiles).map(([id, state]) => {
        const volatile: { id: string; name: string; level?: number } = {
          id,
          name: this.#conditionName(id),
        };
        if (typeof state.level === "number" && Number.isFinite(state.level)) {
          volatile.level = state.level;
        }
        return volatile;
      }),
      lastMove: pokemon.lastMove || null,
    };
  }

  #bench(pokemon: Pokemon, side: 0 | 1): BenchPokemon {
    return {
      ...this.#health(pokemon, side, String(pokemon.originalIdent)),
      ability: this.#ability(pokemon, side),
      item: pokemon.item || this.#set(pokemon, side)?.item || null,
      moves: this.#moves(pokemon, side),
    };
  }

  #health(pokemon: Pokemon, side: 0 | 1, ident: string): PokemonHealthState {
    const hidden = this.#viewer !== null && this.#viewer !== side;
    let hp = finite(pokemon.hp);
    let maxhp = finite(pokemon.maxhp);
    if (hidden) {
      if (maxhp > 0) hp = Math.round(hp / maxhp * 100);
      else hp = pokemon.fainted ? 0 : 100;
      hp = Math.max(0, Math.min(100, hp));
      maxhp = 100;
    }
    return {
      ident,
      speciesForme: pokemon.speciesForme,
      level: finite(pokemon.level),
      gender: pokemon.gender === "M" || pokemon.gender === "F" ? pokemon.gender : "",
      hp,
      maxhp,
      hpIsPercent: hidden,
      fainted: pokemon.fainted,
      status: pokemon.status || null,
    };
  }

  #set(pokemon: Pokemon, side: 0 | 1): PokemonSet | undefined {
    if (pokemon.set) return pokemon.set;
    return this.#sets[side]?.find((set) =>
      (set.name || set.species) === pokemon.name || set.species === pokemon.speciesForme
    );
  }

  #ability(pokemon: Pokemon, side: 0 | 1): string | null {
    let ability: string = pokemon.ability;
    if (!ability || /^[01hs]$/i.test(ability)) ability = this.#set(pokemon, side)?.ability || "";
    if (!ability || /^[01hs]$/i.test(ability)) return null;
    return ability;
  }

  #moves(pokemon: Pokemon, side: 0 | 1): PokemonMove[] {
    if (pokemon.moveSlots.length) return pokemon.moveSlots.map((move) => this.#move(move));
    return (this.#set(pokemon, side)?.moves ?? []).map((move) => {
      const data = this.#gen.moves.get(move);
      return { id: String(data?.id || move), name: String(data?.name || move) };
    });
  }

  #move(move: Pokemon["moveSlots"][number]): PokemonMove {
    const data = this.#gen.moves.get(move.id || move.name);
    const projected: PokemonMove = {
      id: String(data?.id || move.id),
      name: String(data?.name || move.name || move.id),
    };
    if ("pp" in move && Number.isFinite(move.pp)) projected.pp = move.pp;
    if ("maxpp" in move && Number.isFinite(move.maxpp)) projected.maxpp = move.maxpp;
    return projected;
  }

  #hazards(side: Side): LayeredConditionState[] {
    return Object.entries(side.sideConditions)
      .filter(([id]) => HAZARDS.has(id))
      .map(([id, state]) => {
        const hazard: LayeredConditionState = { id, name: state.name || this.#conditionName(id) };
        if (Number.isFinite(state.level) && state.level > 0) hazard.layers = state.level;
        return hazard;
      });
  }

  #screens(side: Side): ConditionState[] {
    return Object.entries(side.sideConditions)
      .filter(([id]) => SCREENS.has(id))
      .map(([id, state]) => ({
        id,
        name: state.name || this.#conditionName(id),
        ...duration(state.minDuration, state.maxDuration),
      }));
  }

  #conditionName(id: string): string {
    return this.#gen.conditions.get(id)?.name || id;
  }
}
