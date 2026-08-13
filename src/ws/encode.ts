import { create } from "@bufbuild/protobuf";
import type { Replay, RequestDTO } from "../battle/types.ts";
import type {
  ActivePokemon,
  BattleState,
  BenchPokemon,
  BoostStat as DomainBoostStat,
  ConditionState,
  PokemonHealthState,
  PokemonMove,
  SideState,
} from "../battle/state.ts";
import {
  BattlePhase,
  BattleStateSchema,
  BoostStat,
  CommandFailureSchema,
  FailureCode,
  GameType,
  Gender,
  Player,
  ReplayResultSchema,
  RequestSchema,
  Side,
  Viewer,
} from "./protocol.ts";
import { requireSint32, requireUint32 } from "./validation.ts";
import { WireAdapterError } from "./validation.ts";

function optionalUint(value: number | undefined, field: string): number | undefined {
  return value === undefined ? undefined : requireUint32(value, field);
}

export function encodeRequest(request: RequestDTO) {
  return create(RequestSchema, {
    rqid: optionalUint(request.rqid, "request.rqid"),
    teamPreview: request.teamPreview,
    wait: request.wait,
    forceSwitch: request.forceSwitch?.map((required) => ({ required })) ?? [],
    active: request.active?.map((active, activeIndex) => ({
      trapped: active.trapped,
      moves: active.moves.map((move, moveIndex) => ({
        id: move.id,
        name: move.name,
        pp: requireUint32(move.pp, `request.active[${activeIndex}].moves[${moveIndex}].pp`),
        maxPp: requireUint32(
          move.maxpp,
          `request.active[${activeIndex}].moves[${moveIndex}].maxpp`,
        ),
        target: move.target,
        disabled: move.disabled,
      })),
    })) ?? [],
    team: request.team.map((pokemon) => ({ ...pokemon })),
  });
}

function internal(message: string): never {
  throw new WireAdapterError(FailureCode.INTERNAL, message);
}

function gender(value: PokemonHealthState["gender"]): Gender {
  switch (value) {
    case "M":
      return Gender.MALE;
    case "F":
      return Gender.FEMALE;
    case "":
      return Gender.NONE;
    default:
      return internal(`invalid Pokémon gender: ${value}`);
  }
}

function health(value: PokemonHealthState, field: string) {
  return {
    ident: value.ident,
    speciesForme: value.speciesForme,
    level: requireUint32(value.level, `${field}.level`),
    gender: gender(value.gender),
    hp: requireUint32(value.hp, `${field}.hp`),
    maxHp: requireUint32(value.maxhp, `${field}.maxhp`),
    hpIsPercent: value.hpIsPercent,
    fainted: value.fainted,
    status: value.status ?? undefined,
  };
}

function move(value: PokemonMove, field: string) {
  return {
    id: value.id,
    name: value.name,
    pp: optionalUint(value.pp, `${field}.pp`),
    maxPp: optionalUint(value.maxpp, `${field}.maxpp`),
  };
}

const BOOST_STATS: Record<DomainBoostStat, BoostStat> = {
  atk: BoostStat.ATTACK,
  def: BoostStat.DEFENSE,
  spa: BoostStat.SPECIAL_ATTACK,
  spd: BoostStat.SPECIAL_DEFENSE,
  spe: BoostStat.SPEED,
  accuracy: BoostStat.ACCURACY,
  evasion: BoostStat.EVASION,
};

function active(value: ActivePokemon, field: string) {
  return {
    health: health(value, field),
    boosts: Object.entries(value.boosts).map(([stat, amount]) => {
      const wireStat = BOOST_STATS[stat as DomainBoostStat];
      if (wireStat === undefined) internal(`invalid boost stat: ${stat}`);
      return {
        stat: wireStat,
        value: requireSint32(amount, `${field}.boosts.${stat}`),
      };
    }),
    ability: value.ability ?? undefined,
    item: value.item ?? undefined,
    moves: value.moves.map((value, index) => move(value, `${field}.moves[${index}]`)),
    volatiles: value.volatiles.map((volatile, index) => ({
      id: volatile.id,
      name: volatile.name,
      level: volatile.level === undefined
        ? undefined
        : requireSint32(volatile.level, `${field}.volatiles[${index}].level`),
    })),
    lastMove: value.lastMove ?? undefined,
  };
}

function bench(value: BenchPokemon, field: string) {
  return {
    health: health(value, field),
    ability: value.ability ?? undefined,
    item: value.item ?? undefined,
    moves: value.moves.map((value, index) => move(value, `${field}.moves[${index}]`)),
  };
}

function condition(value: ConditionState, field: string) {
  return {
    id: value.id,
    name: value.name,
    minTurnsLeft: optionalUint(value.minTurnsLeft, `${field}.minTurnsLeft`),
    maxTurnsLeft: optionalUint(value.maxTurnsLeft, `${field}.maxTurnsLeft`),
  };
}

function wireSide(value: SideState, index: number) {
  if (value.side !== 0 && value.side !== 1) internal(`invalid state side: ${value.side}`);
  const expectedPlayer = value.side === 0 ? "p1" : "p2";
  if (value.player !== expectedPlayer) internal(`state side ${value.side} has mismatched player`);
  return {
    side: value.side === 0 ? Side.ZERO : Side.ONE,
    player: value.player === "p1" ? Player.ONE : Player.TWO,
    name: value.name,
    active: value.active.map((pokemon, slot) => ({
      pokemon: pokemon ? active(pokemon, `state.sides[${index}].active[${slot}]`) : undefined,
    })),
    team: value.team.map((pokemon, teamIndex) =>
      bench(pokemon, `state.sides[${index}].team[${teamIndex}]`)
    ),
    hazards: value.hazards.map((hazard, hazardIndex) => ({
      id: hazard.id,
      name: hazard.name,
      layers: optionalUint(hazard.layers, `state.sides[${index}].hazards[${hazardIndex}].layers`),
    })),
    screens: value.screens.map((screen, screenIndex) =>
      condition(screen, `state.sides[${index}].screens[${screenIndex}]`)
    ),
  };
}

function gameType(value: BattleState["gameType"]): GameType {
  switch (value) {
    case "singles":
      return GameType.SINGLES;
    case "doubles":
      return GameType.DOUBLES;
    case "triples":
      return GameType.TRIPLES;
    default:
      return internal(`invalid game type: ${value}`);
  }
}

function phase(value: BattleState["phase"]): BattlePhase {
  switch (value) {
    case "teampreview":
      return BattlePhase.TEAM_PREVIEW;
    case "battle":
      return BattlePhase.BATTLE;
    case "ended":
      return BattlePhase.ENDED;
    default:
      return internal(`invalid battle phase: ${value}`);
  }
}

function viewer(value: BattleState["viewer"]): Viewer {
  if (value === null) return Viewer.SPECTATOR;
  if (value === 0) return Viewer.SIDE_ZERO;
  if (value === 1) return Viewer.SIDE_ONE;
  return internal(`invalid battle viewer: ${value}`);
}

export function encodeState(state: BattleState) {
  if (state.sides.length !== 2 || new Set(state.sides.map(({ side }) => side)).size !== 2) {
    throw new WireAdapterError(FailureCode.INTERNAL, "battle state must contain exactly two sides");
  }
  return create(BattleStateSchema, {
    turn: requireUint32(state.turn, "state.turn"),
    gameType: gameType(state.gameType),
    phase: phase(state.phase),
    viewer: viewer(state.viewer),
    weather: state.weather
      ? {
        id: state.weather.id,
        name: state.weather.name,
        minTurnsLeft: optionalUint(state.weather.minTurnsLeft, "state.weather.minTurnsLeft"),
        maxTurnsLeft: optionalUint(state.weather.maxTurnsLeft, "state.weather.maxTurnsLeft"),
      }
      : undefined,
    pseudoWeather: state.pseudoWeather.map((value, index) =>
      condition(value, `state.pseudoWeather[${index}]`)
    ),
    sides: state.sides.map(wireSide),
  });
}

export function encodeReplay(battleId: string, replay: Replay) {
  return create(ReplayResultSchema, {
    battleId,
    seed: requireUint32(replay.seed, "replay.seed"),
    inputLog: [...replay.inputLog],
  });
}

export type StableFailureCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "FAILED_PRECONDITION"
  | "INTERNAL";

const FAILURE_CODES: Record<StableFailureCode, FailureCode> = {
  INVALID_ARGUMENT: FailureCode.INVALID_ARGUMENT,
  NOT_FOUND: FailureCode.NOT_FOUND,
  FAILED_PRECONDITION: FailureCode.FAILED_PRECONDITION,
  INTERNAL: FailureCode.INTERNAL,
};

export function encodeFailure(code: StableFailureCode, message: string) {
  return create(CommandFailureSchema, { code: FAILURE_CODES[code], message });
}

export function encodeUnexpectedFailure(error: unknown) {
  if (error instanceof WireAdapterError) {
    return create(CommandFailureSchema, { code: error.code, message: error.message });
  }
  return encodeFailure("INTERNAL", "internal error");
}
