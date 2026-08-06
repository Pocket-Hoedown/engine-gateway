import { toID } from "@pkmn/data";
import { Protocol } from "@pkmn/protocol";

export interface Ref {
  side: 0 | 1;
  slot: number | null;
  player: "p1" | "p2";
  name: string;
}

export type RawKeywordArgs = Record<string, string | true>;

export type SemanticEvent =
  | { type: "turn"; turn: number }
  | {
    type: "switch";
    side: 0 | 1;
    slot: number;
    ident: string;
    speciesForme: string;
    dragged: boolean;
  }
  | { type: "move"; source: Ref; move: string; target: Ref | null; miss: boolean; from?: string }
  | {
    type: "damage";
    target: Ref;
    hp: number;
    maxhp: number;
    hpIsPercent: boolean;
    status: string | null;
    from?: string;
  }
  | {
    type: "heal";
    target: Ref;
    hp: number;
    maxhp: number;
    hpIsPercent: boolean;
    status: string | null;
    from?: string;
  }
  | { type: "faint"; target: Ref }
  | { type: "status"; target: Ref; status: string }
  | { type: "curestatus"; target: Ref; status: string }
  | { type: "boost"; target: Ref; stat: string; amount: number }
  | { type: "unboost"; target: Ref; stat: string; amount: number }
  | { type: "setboost"; target: Ref; stat: string; value: number }
  | {
    type: "effectiveness";
    target: Ref;
    kind: "supereffective" | "resisted" | "immune" | "crit";
  }
  | { type: "weather"; weather: string | null; upkeep: boolean }
  | { type: "sidecondition"; side: 0 | 1; id: string; name: string; ended: boolean }
  | { type: "fieldcondition"; id: string; name: string; ended: boolean }
  | { type: "reveal"; target: Ref; what: "ability" | "item" | "move"; value: string }
  | { type: "volatile"; target: Ref; id: string; name: string; ended: boolean }
  | { type: "cant"; target: Ref; reason: string; move?: string }
  | { type: "raw"; name: string; args: string[]; kwArgs: RawKeywordArgs };

function value(args: readonly unknown[], index: number): string {
  const result = args[index];
  if (result === undefined || result === null || result === "") throw new Error("missing argument");
  return String(result);
}

function optional(value: unknown): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function numberValue(args: readonly unknown[], index: number): number {
  const result = Number(value(args, index));
  if (!Number.isFinite(result)) throw new Error("invalid number");
  return result;
}

function keywordArgs(kwArgs: object): RawKeywordArgs {
  const result: RawKeywordArgs = {};
  for (const [key, raw] of Object.entries(kwArgs)) {
    if (raw === true) result[key] = true;
    else if (raw !== false && raw !== undefined && raw !== null) result[key] = String(raw);
  }
  return result;
}

function rawEvent(args: readonly unknown[], kwArgs: object): SemanticEvent | null {
  const name = optional(args[0]);
  if (!name) return null;
  return {
    type: "raw",
    name,
    args: args.slice(1).map(String),
    kwArgs: keywordArgs(kwArgs),
  };
}

function effect(raw: string): { id: string; name: string } {
  const parsed = Protocol.parseEffect(raw);
  return { id: toID(parsed.name), name: parsed.name };
}

function sideFrom(raw: string): 0 | 1 {
  if (raw.startsWith("p1")) return 0;
  if (raw.startsWith("p2")) return 1;
  throw new Error("invalid side");
}

function normalizedHealth(
  raw: string,
  target: Ref,
  viewer: 0 | 1 | null,
): { hp: number; maxhp: number; hpIsPercent: boolean; status: string | null } {
  const parsed = Protocol.parseHealth(raw as never);
  if (!parsed) throw new Error("invalid health");
  const percent = viewer !== null && viewer !== target.side;
  let hp = Number(parsed.hp);
  let maxhp = Number(parsed.maxhp);
  if (!Number.isFinite(hp) || !Number.isFinite(maxhp)) throw new Error("invalid health");
  if (percent) {
    hp = maxhp > 0 ? Math.round(hp / maxhp * 100) : parsed.fainted ? 0 : 100;
    hp = Math.max(0, Math.min(100, hp));
    maxhp = 100;
  }
  return {
    hp,
    maxhp,
    hpIsPercent: percent,
    status: parsed.status || null,
  };
}

function withFrom<T extends object>(event: T, kwArgs: RawKeywordArgs): T & { from?: string } {
  return kwArgs.from ? { ...event, from: String(kwArgs.from) } : event;
}

export function parseIdent(ident: string): Ref | null {
  const match = /^(p[12])([abc])?:\s*(.+)$/.exec(ident);
  if (!match) return null;
  const player = match[1] as "p1" | "p2";
  const slot = match[2] ? match[2].charCodeAt(0) - 97 : null;
  return {
    side: player === "p1" ? 0 : 1,
    slot,
    player,
    name: match[3],
  };
}

export function mapEvent(
  args: readonly unknown[],
  rawKwArgs: object,
  viewer: 0 | 1 | null,
): SemanticEvent | null {
  const name = optional(args[0]);
  if (!name || name === "request" || name === "upkeep" || name === "sideupdate" || name === "t:") {
    return null;
  }
  const kwArgs = keywordArgs(rawKwArgs);
  const ref = (index: number): Ref => {
    const parsed = parseIdent(value(args, index));
    if (!parsed) throw new Error("invalid ident");
    return parsed;
  };

  try {
    switch (name) {
      case "turn":
        return { type: "turn", turn: numberValue(args, 1) };
      case "switch":
      case "drag": {
        const target = ref(1);
        if (target.slot === null) throw new Error("inactive switch");
        const details = Protocol.parseDetails(
          target.name,
          value(args, 1) as never,
          value(args, 2) as never,
        );
        return {
          type: "switch",
          side: target.side,
          slot: target.slot,
          ident: value(args, 1),
          speciesForme: String(details.speciesForme),
          dragged: name === "drag",
        };
      }
      case "move": {
        const source = ref(1);
        const targetRaw = optional(args[3]);
        const target = !targetRaw || targetRaw === "null" ? null : parseIdent(targetRaw);
        if (targetRaw && targetRaw !== "null" && !target) throw new Error("invalid target");
        return withFrom({
          type: "move" as const,
          source,
          move: value(args, 2),
          target,
          miss: kwArgs.miss === true,
        }, kwArgs);
      }
      case "-damage":
      case "-heal": {
        const target = ref(1);
        return withFrom({
          type: name === "-damage" ? "damage" as const : "heal" as const,
          target,
          ...normalizedHealth(value(args, 2), target, viewer),
        }, kwArgs);
      }
      case "faint":
        return { type: "faint", target: ref(1) };
      case "-status":
        return { type: "status", target: ref(1), status: value(args, 2) };
      case "-curestatus":
        return { type: "curestatus", target: ref(1), status: value(args, 2) };
      case "-boost":
        return {
          type: "boost",
          target: ref(1),
          stat: value(args, 2),
          amount: numberValue(args, 3),
        };
      case "-unboost":
        return {
          type: "unboost",
          target: ref(1),
          stat: value(args, 2),
          amount: numberValue(args, 3),
        };
      case "-setboost":
        return {
          type: "setboost",
          target: ref(1),
          stat: value(args, 2),
          value: numberValue(args, 3),
        };
      case "-supereffective":
      case "-resisted":
      case "-immune":
      case "-crit":
        return {
          type: "effectiveness",
          target: ref(1),
          kind: name.slice(1) as "supereffective" | "resisted" | "immune" | "crit",
        };
      case "-weather": {
        const raw = value(args, 1);
        return {
          type: "weather",
          weather: raw === "none" ? null : Protocol.parseEffect(raw).name,
          upkeep: kwArgs.upkeep === true,
        };
      }
      case "-sidestart":
      case "-sideend": {
        const condition = effect(value(args, 2));
        return {
          type: "sidecondition",
          side: sideFrom(value(args, 1)),
          ...condition,
          ended: name === "-sideend",
        };
      }
      case "-fieldstart":
      case "-fieldend": {
        const condition = effect(value(args, 1));
        return { type: "fieldcondition", ...condition, ended: name === "-fieldend" };
      }
      case "-ability":
        return { type: "reveal", target: ref(1), what: "ability", value: value(args, 2) };
      case "-item":
      case "-enditem":
        return { type: "reveal", target: ref(1), what: "item", value: value(args, 2) };
      case "-start":
      case "-end":
      case "-activate": {
        const condition = effect(value(args, 2));
        return { type: "volatile", target: ref(1), ...condition, ended: name === "-end" };
      }
      case "cant": {
        const move = optional(args[3]);
        return {
          type: "cant",
          target: ref(1),
          reason: value(args, 2),
          ...(move ? { move } : {}),
        };
      }
      default:
        return rawEvent(args, rawKwArgs);
    }
  } catch {
    return rawEvent(args, rawKwArgs);
  }
}
