import type { PokemonSet, StatsTable } from "@pkmn/sim";
import type { PhfMember } from "./types.ts";
import { mulberry32 } from "./rng.ts";

// Gen-5 Hidden Power type order (16 types; no Normal/Fairy).
const HP_TYPES = [
  "Fighting",
  "Flying",
  "Poison",
  "Ground",
  "Rock",
  "Bug",
  "Ghost",
  "Steel",
  "Fire",
  "Water",
  "Grass",
  "Electric",
  "Psychic",
  "Ice",
  "Dragon",
  "Dark",
] as const;

// Bit weights for the parity of each stat's IV: HP=1, Atk=2, Def=4, Spe=8, SpA=16, SpD=32.
function paritySum(ivs: StatsTable): number {
  return (ivs.hp & 1) * 1 + (ivs.atk & 1) * 2 + (ivs.def & 1) * 4 +
    (ivs.spe & 1) * 8 + (ivs.spa & 1) * 16 + (ivs.spd & 1) * 32;
}

export function computeHpType(ivs: StatsTable): string {
  return HP_TYPES[Math.floor((paritySum(ivs) * 15) / 63)];
}

/** Random IV 0..31; if forceParity is given, force the low bit. */
function randomIV(rng: () => number, forceParity?: 0 | 1): number {
  const v = Math.floor(rng() * 32);
  if (forceParity === undefined) return v;
  return (v & ~1) | forceParity;
}

/**
 * Produce a full IV spread. With no hpType, all IVs are random. With an hpType,
 * pick a parity-combo (0..63) that yields that type, force each stat's low bit
 * to match, and randomize the upper bits — so HP type is pinned but the rest is random.
 */
export function randomizeIVs(member: PhfMember, rng: () => number): StatsTable {
  if (!member.hpType) {
    return {
      hp: randomIV(rng),
      atk: randomIV(rng),
      def: randomIV(rng),
      spa: randomIV(rng),
      spd: randomIV(rng),
      spe: randomIV(rng),
    };
  }
  const targetIndex = HP_TYPES.indexOf(member.hpType as typeof HP_TYPES[number]);
  if (targetIndex < 0) throw new Error(`Unknown Hidden Power type: ${member.hpType}`);

  const combos: number[] = [];
  for (let c = 0; c < 64; c++) {
    if (Math.floor((c * 15) / 63) === targetIndex) combos.push(c);
  }
  const combo = combos[Math.floor(rng() * combos.length)];
  // combo bit order: bit0=HP, 1=Atk, 2=Def, 3=Spe, 4=SpA, 5=SpD
  const parity = {
    hp: (combo >> 0) & 1,
    atk: (combo >> 1) & 1,
    def: (combo >> 2) & 1,
    spe: (combo >> 3) & 1,
    spa: (combo >> 4) & 1,
    spd: (combo >> 5) & 1,
  } as const;
  return {
    hp: randomIV(rng, parity.hp as 0 | 1),
    atk: randomIV(rng, parity.atk as 0 | 1),
    def: randomIV(rng, parity.def as 0 | 1),
    spa: randomIV(rng, parity.spa as 0 | 1),
    spd: randomIV(rng, parity.spd as 0 | 1),
    spe: randomIV(rng, parity.spe as 0 | 1),
  };
}

/** Assign seeded IVs to every set in a team. Mutates and returns the sets. */
export function assignTeamIVs(
  sets: PokemonSet[],
  members: PhfMember[],
  seed: number,
): PokemonSet[] {
  // One RNG stream for the whole team so the seed fully determines the result.
  const rng = mulberry32(seed);
  sets.forEach((set, i) => {
    set.ivs = randomizeIVs(members[i], rng);
  });
  return sets;
}
