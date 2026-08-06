export type BoostStat = "atk" | "def" | "spa" | "spd" | "spe" | "accuracy" | "evasion";

export interface DurationState {
  minTurnsLeft?: number;
  maxTurnsLeft?: number;
}

export interface WeatherState extends DurationState {
  id: string;
  name: string;
}

export interface ConditionState extends DurationState {
  id: string;
  name: string;
}

export interface LayeredConditionState {
  id: string;
  name: string;
  layers?: number;
}

export interface PokemonMove {
  id: string;
  name: string;
  pp?: number;
  maxpp?: number;
}

export interface PokemonHealthState {
  ident: string;
  speciesForme: string;
  level: number;
  gender: "M" | "F" | "";
  hp: number;
  maxhp: number;
  hpIsPercent: boolean;
  fainted: boolean;
  status: string | null;
}

export interface ActivePokemon extends PokemonHealthState {
  boosts: Partial<Record<BoostStat, number>>;
  ability: string | null;
  item: string | null;
  moves: PokemonMove[];
  volatiles: Array<{ id: string; name: string; level?: number }>;
  lastMove: string | null;
}

export interface BenchPokemon extends PokemonHealthState {
  ability: string | null;
  item: string | null;
  moves: PokemonMove[];
}

export interface SideState {
  side: 0 | 1;
  player: "p1" | "p2";
  name: string;
  active: Array<ActivePokemon | null>;
  team: BenchPokemon[];
  hazards: LayeredConditionState[];
  screens: ConditionState[];
}

export interface BattleState {
  turn: number;
  gameType: "singles" | "doubles" | "triples";
  phase: "teampreview" | "battle" | "ended";
  viewer: 0 | 1 | null;
  weather: WeatherState | null;
  pseudoWeather: ConditionState[];
  sides: [SideState, SideState];
}
