import type { BattleFormat, GameMode } from "../modes/types.ts";
import type { PhfTeam } from "../teams/types.ts";
import type { SemanticEvent } from "./events.ts";
import type { BattleState } from "./state.ts";

export interface MoveOption {
  id: string;
  name: string;
  pp: number;
  maxpp: number;
  target: string;
  disabled: boolean;
}

export interface ActiveOption {
  moves: MoveOption[];
  trapped?: boolean;
}

export interface RequestPokemon {
  ident: string;
  details: string;
  condition: string;
  active: boolean;
}

/** 3a-normalized legal actions for one side. `rqid` is absent in the getPlayerStreams model. */
export interface RequestDTO {
  rqid?: number;
  teamPreview?: boolean;
  wait?: boolean;
  forceSwitch?: boolean[];
  active?: ActiveOption[];
  team: RequestPokemon[];
}

export interface BattleFrameDomain {
  turn: number;
  phase: BattleState["phase"];
  protocolLines: string[];
  events: SemanticEvent[];
  checkpoint: BattleState;
}

export type BattleEvent =
  | { kind: "request"; request: RequestDTO }
  | { kind: "frame"; frame: BattleFrameDomain }
  | { kind: "event"; events: SemanticEvent[] }
  | { kind: "state"; state: BattleState }
  | { kind: "error"; message: string; choiceId?: string; rqid?: number }
  | { kind: "ended"; winner: string | null };

export interface ControllerSpec {
  id: string;
  side: 0 | 1;
  team: PhfTeam;
}

export interface CreateBattleRequest {
  mode: GameMode;
  format: BattleFormat;
  controllers: ControllerSpec[];
  seed?: number;
}

export interface Replay {
  seed: number;
  inputLog: string[];
}

/** Thrown for invalid create/submit requests (unknown controller, bad shape, ended battle). */
export class BattleRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BattleRequestError";
  }
}
