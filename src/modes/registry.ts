import type { GameMode } from "./types.ts";

const modes = new Map<string, GameMode>();

export function registerMode(mode: GameMode): void {
  modes.set(mode.id, mode);
}

export function getMode(id: string): GameMode | undefined {
  return modes.get(id);
}

export function listModes(): GameMode[] {
  return [...modes.values()];
}
