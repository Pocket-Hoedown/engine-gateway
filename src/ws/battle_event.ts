import { create } from "@bufbuild/protobuf";
import type { Ref, SemanticEvent } from "../battle/events.ts";
import type { BattleEvent, BattleFrameDomain } from "../battle/types.ts";
import {
  Audience,
  BattleErrorSchema,
  BattleFrameSchema,
  BattlePhase,
  BattleResultSchema,
  BattleStreamEventSchema,
  EffectivenessKind,
  FailureCode,
  Player,
  RevealKind,
  SemanticEventBatchSchema,
  SemanticEventSchema,
  Side,
} from "./protocol.ts";
import { encodeRequest, encodeState } from "./encode.ts";
import { requireSint32, requireText, requireUint32, WireAdapterError } from "./validation.ts";

function side(value: 0 | 1): Side {
  if (value === 0) return Side.ZERO;
  if (value === 1) return Side.ONE;
  throw new WireAdapterError(FailureCode.INTERNAL, `invalid domain side: ${value}`);
}

function ref(value: Ref, field: string) {
  const expectedPlayer = value.side === 0 ? "p1" : "p2";
  if (value.player !== expectedPlayer) {
    throw new WireAdapterError(FailureCode.INTERNAL, `${field} player does not match side`);
  }
  return {
    side: side(value.side),
    slot: value.slot === null ? undefined : requireUint32(value.slot, `${field}.slot`),
    player: value.player === "p1" ? Player.ONE : Player.TWO,
    name: value.name,
  };
}

function effectiveness(value: Extract<SemanticEvent, { type: "effectiveness" }>["kind"]) {
  switch (value) {
    case "supereffective":
      return EffectivenessKind.SUPER_EFFECTIVE;
    case "resisted":
      return EffectivenessKind.RESISTED;
    case "immune":
      return EffectivenessKind.IMMUNE;
    case "crit":
      return EffectivenessKind.CRITICAL;
    default:
      throw new WireAdapterError(FailureCode.INTERNAL, `invalid effectiveness kind: ${value}`);
  }
}

function reveal(value: Extract<SemanticEvent, { type: "reveal" }>["what"]) {
  switch (value) {
    case "ability":
      return RevealKind.ABILITY;
    case "item":
      return RevealKind.ITEM;
    case "move":
      return RevealKind.MOVE;
    default:
      throw new WireAdapterError(FailureCode.INTERNAL, `invalid reveal kind: ${value}`);
  }
}

export function encodeSemanticEvent(event: SemanticEvent) {
  switch (event.type) {
    case "turn":
      return create(SemanticEventSchema, {
        event: { case: "turn", value: { turn: requireUint32(event.turn, "event.turn") } },
      });
    case "switch":
      return create(SemanticEventSchema, {
        event: {
          case: "switch",
          value: {
            side: side(event.side),
            slot: requireUint32(event.slot, "event.switch.slot"),
            ident: event.ident,
            speciesForme: event.speciesForme,
            dragged: event.dragged,
          },
        },
      });
    case "move":
      return create(SemanticEventSchema, {
        event: {
          case: "move",
          value: {
            source: ref(event.source, "event.move.source"),
            move: event.move,
            target: event.target ? ref(event.target, "event.move.target") : undefined,
            miss: event.miss,
            from: event.from,
          },
        },
      });
    case "damage":
    case "heal":
      return create(SemanticEventSchema, {
        event: {
          case: event.type,
          value: {
            target: ref(event.target, `event.${event.type}.target`),
            hp: requireUint32(event.hp, `event.${event.type}.hp`),
            maxHp: requireUint32(event.maxhp, `event.${event.type}.maxhp`),
            hpIsPercent: event.hpIsPercent,
            status: event.status ?? undefined,
            from: event.from,
          },
        },
      });
    case "faint":
      return create(SemanticEventSchema, {
        event: { case: "faint", value: { target: ref(event.target, "event.faint.target") } },
      });
    case "status":
      return create(SemanticEventSchema, {
        event: {
          case: "status",
          value: { target: ref(event.target, "event.status.target"), status: event.status },
        },
      });
    case "curestatus":
      return create(SemanticEventSchema, {
        event: {
          case: "cureStatus",
          value: { target: ref(event.target, "event.curestatus.target"), status: event.status },
        },
      });
    case "boost":
    case "unboost":
      return create(SemanticEventSchema, {
        event: {
          case: event.type,
          value: {
            target: ref(event.target, `event.${event.type}.target`),
            stat: event.stat,
            amount: requireSint32(event.amount, `event.${event.type}.amount`),
          },
        },
      });
    case "setboost":
      return create(SemanticEventSchema, {
        event: {
          case: "setBoost",
          value: {
            target: ref(event.target, "event.setboost.target"),
            stat: event.stat,
            value: requireSint32(event.value, "event.setboost.value"),
          },
        },
      });
    case "effectiveness":
      return create(SemanticEventSchema, {
        event: {
          case: "effectiveness",
          value: {
            target: ref(event.target, "event.effectiveness.target"),
            kind: effectiveness(event.kind),
          },
        },
      });
    case "weather":
      return create(SemanticEventSchema, {
        event: {
          case: "weather",
          value: { weather: event.weather ?? undefined, upkeep: event.upkeep },
        },
      });
    case "sidecondition":
      return create(SemanticEventSchema, {
        event: {
          case: "sideCondition",
          value: { side: side(event.side), id: event.id, name: event.name, ended: event.ended },
        },
      });
    case "fieldcondition":
      return create(SemanticEventSchema, {
        event: {
          case: "fieldCondition",
          value: { id: event.id, name: event.name, ended: event.ended },
        },
      });
    case "reveal":
      return create(SemanticEventSchema, {
        event: {
          case: "reveal",
          value: {
            target: ref(event.target, "event.reveal.target"),
            what: reveal(event.what),
            value: event.value,
          },
        },
      });
    case "volatile":
      return create(SemanticEventSchema, {
        event: {
          case: "volatile",
          value: {
            target: ref(event.target, "event.volatile.target"),
            id: event.id,
            name: event.name,
            ended: event.ended,
          },
        },
      });
    case "cant":
      return create(SemanticEventSchema, {
        event: {
          case: "cant",
          value: {
            target: ref(event.target, "event.cant.target"),
            reason: event.reason,
            move: event.move,
          },
        },
      });
    case "raw":
      return create(SemanticEventSchema, {
        event: {
          case: "raw",
          value: {
            name: event.name,
            args: [...event.args],
            keywordArgs: Object.entries(event.kwArgs).map(([key, value]) => ({
              key,
              value: {
                value: typeof value === "boolean"
                  ? { case: "boolValue" as const, value }
                  : { case: "stringValue" as const, value },
              },
            })),
          },
        },
      });
  }
}

export function encodeSemanticEvents(events: SemanticEvent[]) {
  return create(SemanticEventBatchSchema, { events: events.map(encodeSemanticEvent) });
}

export function encodeBattleFrame(frame: BattleFrameDomain) {
  return create(BattleFrameSchema, {
    turn: requireUint32(frame.turn, "frame.turn"),
    phase: frame.phase === "teampreview"
      ? BattlePhase.TEAM_PREVIEW
      : frame.phase === "battle"
      ? BattlePhase.BATTLE
      : BattlePhase.ENDED,
    protocolLines: [...frame.protocolLines],
    events: frame.events.map(encodeSemanticEvent),
    checkpoint: encodeState(frame.checkpoint),
  });
}

export type BattleAudience =
  | { audience: "controller"; controllerId: string; side: 0 | 1 }
  | { audience: "spectator" };

export function encodeBattleEvent(
  battleId: string,
  destination: BattleAudience,
  event: BattleEvent,
) {
  requireText(battleId, "battle id");
  if (destination.audience !== "controller" && destination.audience !== "spectator") {
    throw new WireAdapterError(FailureCode.INTERNAL, "invalid stream audience");
  }
  const controller = destination.audience === "controller";
  if (controller) {
    requireText(destination.controllerId, "controller id");
    side(destination.side);
  }
  if (event.kind === "request" && !controller) {
    throw new WireAdapterError(FailureCode.INTERNAL, "requests require a controller audience");
  }
  if (event.kind === "state") {
    const expectedViewer = controller ? destination.side : null;
    if (event.state.viewer !== expectedViewer) {
      throw new WireAdapterError(
        FailureCode.INTERNAL,
        "state viewer does not match stream audience",
      );
    }
  }
  if (event.kind === "frame") {
    const expectedViewer = controller ? destination.side : null;
    if (event.frame.checkpoint.viewer !== expectedViewer) {
      throw new WireAdapterError(
        FailureCode.INTERNAL,
        "frame checkpoint viewer does not match stream audience",
      );
    }
  }
  const payload = (() => {
    switch (event.kind) {
      case "request":
        return { case: "request" as const, value: encodeRequest(event.request) };
      case "frame":
        return { case: "frame" as const, value: encodeBattleFrame(event.frame) };
      case "event":
        return { case: "semanticEvents" as const, value: encodeSemanticEvents(event.events) };
      case "state":
        return { case: "state" as const, value: encodeState(event.state) };
      case "error":
        return {
          case: "error" as const,
          value: create(BattleErrorSchema, {
            message: event.message,
            choiceId: event.choiceId,
            rqid: event.rqid,
          }),
        };
      case "ended":
        return {
          case: "ended" as const,
          value: create(BattleResultSchema, { winner: event.winner ?? undefined }),
        };
    }
  })();
  return create(BattleStreamEventSchema, {
    battleId,
    audience: controller ? Audience.CONTROLLER : Audience.SPECTATOR,
    controllerId: controller ? destination.controllerId : undefined,
    payload,
  });
}
