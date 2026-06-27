import { type Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

/** The single Gen-5 data accessor. Every piece of Pokémon data flows through this. */
export const gen: Generation = new Generations(Dex).get(5);
