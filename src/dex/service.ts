import { gen } from "./gen.ts";
import { toAbilityDTO, toItemDTO, toMoveDTO, toSpeciesDTO, toTypeChartDTO } from "./map.ts";
import { legalMovepool } from "./learnset.ts";
import type { AbilityDTO, ItemDTO, LearnsetDTO, MoveDTO, SpeciesDTO, TypeChartDTO } from "./dto.ts";

/** Thrown when a requested dex id does not exist in Gen 5. */
export class DexNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "DexNotFoundError";
  }
}

// `gen.<cache>.get()` normalizes its argument, so raw `:id` path params resolve directly.

export function listSpecies(): SpeciesDTO[] {
  return [...gen.species].map(toSpeciesDTO);
}
export function getSpecies(id: string): SpeciesDTO {
  const s = gen.species.get(id);
  if (!s) throw new DexNotFoundError("species", id);
  return toSpeciesDTO(s);
}

export async function getLearnset(id: string): Promise<LearnsetDTO> {
  const s = gen.species.get(id);
  if (!s) throw new DexNotFoundError("species", id);
  return { id: s.id, moves: await legalMovepool(s.id) };
}

export function listMoves(): MoveDTO[] {
  return [...gen.moves].map(toMoveDTO);
}
export function getMove(id: string): MoveDTO {
  const m = gen.moves.get(id);
  if (!m) throw new DexNotFoundError("move", id);
  return toMoveDTO(m);
}

export function listAbilities(): AbilityDTO[] {
  return [...gen.abilities].map(toAbilityDTO);
}
export function getAbility(id: string): AbilityDTO {
  const a = gen.abilities.get(id);
  if (!a) throw new DexNotFoundError("ability", id);
  return toAbilityDTO(a);
}

export function listItems(): ItemDTO[] {
  return [...gen.items].map(toItemDTO);
}
export function getItem(id: string): ItemDTO {
  const i = gen.items.get(id);
  if (!i) throw new DexNotFoundError("item", id);
  return toItemDTO(i);
}

export function getTypeChart(): TypeChartDTO {
  return toTypeChartDTO(gen);
}
