export interface SpeciesDTO {
  id: string;
  num: number;
  name: string;
  types: string[];
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  abilities: { primary: string; secondary?: string; hidden?: string };
  eggGroups: string[];
  genderRatio: { M: number; F: number };
  heightm: number;
  weightkg: number;
  color: string;
  prevo?: string;
  evos?: string[];
  baseSpecies?: string;
  forme?: string;
}

export interface MoveDTO {
  id: string;
  num: number;
  name: string;
  type: string;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  accuracy: number | null; // null = bypasses accuracy (can't miss)
  pp: number;
  priority: number;
  target: string;
  flags: string[];
  shortDesc: string;
  desc: string;
}

export interface AbilityDTO { id: string; num: number; name: string; shortDesc: string; desc: string }
export interface ItemDTO { id: string; num: number; name: string; shortDesc: string; desc: string }

export interface TypeChartDTO {
  types: string[];
  // effectiveness[attackingType][defendingType] = damage multiplier
  effectiveness: Record<string, Record<string, 0 | 0.5 | 1 | 2>>;
}

export interface LearnsetDTO { id: string; moves: string[] }

export interface DexError { error: { code: "not_found"; message: string } }
