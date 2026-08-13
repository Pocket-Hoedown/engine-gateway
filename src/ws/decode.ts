import type { CreateBattleRequest } from "../battle/types.ts";
import type { BattleFormat as DomainBattleFormat } from "../modes/types.ts";
import { StandardMode } from "../modes/standard.ts";
import type { PhfMember, PhfTeam } from "../teams/types.ts";
import {
  BattleFormat,
  type CreateBattle,
  Gender,
  type PhfMember as WirePhfMember,
  type PhfTeam as WirePhfTeam,
  Side,
} from "./protocol.ts";
import { invalid, requireText, requireUint32 } from "./validation.ts";

export function resolveMode(modeId: string) {
  if (modeId !== StandardMode.id) invalid(`unknown mode: ${modeId || "<empty>"}`);
  return StandardMode;
}

function decodeFormat(format: BattleFormat): DomainBattleFormat {
  switch (format) {
    case BattleFormat.SINGLE:
      return "single";
    case BattleFormat.DOUBLE:
      return "double";
    case BattleFormat.TRIPLE:
      return "triple";
    case BattleFormat.MULTI:
      return invalid("battle format 'multi' is not supported");
    case BattleFormat.UNSPECIFIED:
      return invalid("battle format is required");
    default:
      return invalid(`unknown battle format: ${format}`);
  }
}

function decodeSide(side: Side): 0 | 1 {
  switch (side) {
    case Side.ZERO:
      return 0;
    case Side.ONE:
      return 1;
    case Side.UNSPECIFIED:
      return invalid("controller side is required");
    default:
      return invalid(`unknown controller side: ${side}`);
  }
}

function optionalUint(value: number | undefined, field: string): number | undefined {
  return value === undefined ? undefined : requireUint32(value, field);
}

function decodeGender(gender: Gender | undefined): PhfMember["gender"] {
  switch (gender) {
    case undefined:
      return undefined;
    case Gender.MALE:
      return "M";
    case Gender.FEMALE:
      return "F";
    case Gender.NONE:
      return "N";
    case Gender.UNSPECIFIED:
      return invalid("member gender must not be unspecified when present");
    default:
      return invalid(`unknown member gender: ${gender}`);
  }
}

function decodeMember(member: WirePhfMember, index: number): PhfMember {
  const field = `team member ${index}`;
  requireText(member.species, `${field} species`);
  requireText(member.ability, `${field} ability`);
  requireText(member.nature, `${field} nature`);
  if (!member.moves.length || member.moves.some((move) => !move.length)) {
    invalid(`${field} must have nonempty moves`);
  }
  const evs = member.evs
    ? Object.fromEntries(
      Object.entries(member.evs)
        .filter(([key, value]) => key !== "$typeName" && value !== undefined)
        .map(([key, value]) => [key, requireUint32(value as number, `${field} evs.${key}`)]),
    )
    : undefined;
  return {
    species: member.species,
    ability: member.ability,
    nature: member.nature,
    moves: [...member.moves],
    ...(member.item !== undefined ? { item: member.item } : {}),
    ...(member.level !== undefined ? { level: optionalUint(member.level, `${field} level`) } : {}),
    ...(member.gender !== undefined ? { gender: decodeGender(member.gender) } : {}),
    ...(member.shiny !== undefined ? { shiny: member.shiny } : {}),
    ...(member.happiness !== undefined
      ? { happiness: optionalUint(member.happiness, `${field} happiness`) }
      : {}),
    ...(member.hpType !== undefined ? { hpType: member.hpType } : {}),
    ...(evs ? { evs } : {}),
  };
}

export function decodeTeam(team: WirePhfTeam | undefined): PhfTeam {
  if (!team) invalid("controller team is required");
  if (team.schema !== "phf-team/1") invalid(`unsupported team schema: ${team.schema || "<empty>"}`);
  if (requireUint32(team.gen, "team gen") !== 5) {
    invalid(`unsupported team generation: ${team.gen}`);
  }
  requireText(team.name, "team name");
  if (!team.members.length) invalid("team must contain at least one member");
  return {
    schema: "phf-team/1",
    name: team.name,
    gen: 5,
    ...(team.tags.length ? { tags: [...team.tags] } : {}),
    members: team.members.map(decodeMember),
  };
}

export function decodeCreateBattle(message: CreateBattle): CreateBattleRequest {
  const mode = resolveMode(message.modeId);
  const format = decodeFormat(message.format);
  if (message.controllers.length !== 2) invalid("create battle requires exactly 2 controllers");
  const controllers = message.controllers.map((controller) => ({
    id: requireText(controller.id, "controller id"),
    side: decodeSide(controller.side),
    team: decodeTeam(controller.team),
  }));
  if (new Set(controllers.map(({ id }) => id)).size !== 2) {
    invalid("controller ids must be distinct");
  }
  if (new Set(controllers.map(({ side }) => side)).size !== 2) {
    invalid("controllers must be assigned to distinct sides");
  }
  return {
    mode,
    format,
    controllers,
    ...(message.seed !== undefined ? { seed: requireUint32(message.seed, "seed") } : {}),
  };
}
