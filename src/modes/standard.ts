import type { BattleFormat, GameMode } from "./types.ts";

const FORMAT_IDS: Record<BattleFormat, string> = {
  single: "gen5customgame",
  double: "gen5doublescustomgame",
  triple: "gen5triplescustomgame",
  multi: "gen5multcustomgame", // multi runs on the doubles engine; confirmed/adjusted in Phase 3
};

/** The baseline built-in mode: Gen-5 Custom Game from pre-built teams.
 *  Clause primitives and team validation arrive in Phase 4. */
export const StandardMode: GameMode = {
  id: "standard",
  name: "Standard",
  battleFormats: ["single", "double", "triple", "multi"],
  compileFormatId(format) {
    return FORMAT_IDS[format];
  },
};
