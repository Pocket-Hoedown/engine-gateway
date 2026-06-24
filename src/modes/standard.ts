import type { BattleFormat, GameMode } from "./types.ts";

const FORMAT_IDS: Record<"single" | "double" | "triple", string> = {
  single: "gen5customgame",
  double: "gen5doublescustomgame",
  triple: "gen5triplescustomgame",
};

/** The baseline built-in mode: Gen-5 Custom Game from pre-built teams.
 *  Clause primitives and team validation arrive in Phase 4. */
export const StandardMode: GameMode = {
  id: "standard",
  name: "Standard",
  // 'multi' is part of the intended v1 surface but is NOT yet compilable to a
  // sim format — multi battles need a gameType:'multi' override (Phase 3), not a
  // custom-game id. compileFormatId throws for it until then.
  battleFormats: ["single", "double", "triple", "multi"],
  compileFormatId(format) {
    if (format === "multi") {
      throw new Error(
        "Battle format 'multi' is not supported until Phase 3 (needs a gameType:'multi' override, not a custom-game format id)",
      );
    }
    return FORMAT_IDS[format];
  },
};
