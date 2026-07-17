import { BattleStreams, PRNG, RandomPlayerAI } from "@pkmn/sim";
import { buildStartBlock, isTimestampLine, type SimSeed, winnerFromLine } from "./protocol.ts";

export type { SimSeed } from "./protocol.ts"; // keep the public re-export for modes/types.ts + index.ts

export interface BattleResult {
  winner: string | null;
  log: string[];
}

export interface HeadlessBattleOptions {
  formatid: string;
  packedTeams: [string, string];
  seed: SimSeed;
}

/**
 * Runs a battle to completion using seeded random AIs for both sides.
 * Deterministic for a given (formatid, packedTeams, seed).
 */
export async function runHeadlessBattle(opts: HeadlessBattleOptions): Promise<BattleResult> {
  const battleStream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(battleStream);

  // Distinct-but-deterministic AI seeds derived from the battle seed.
  const aiSeedP1: SimSeed = [opts.seed[0] ^ 0x1111, opts.seed[1], opts.seed[2], opts.seed[3]];
  const aiSeedP2: SimSeed = [opts.seed[0] ^ 0x2222, opts.seed[1], opts.seed[2], opts.seed[3]];
  const p1 = new RandomPlayerAI(streams.p1, { seed: PRNG.convertSeed(aiSeedP1) });
  const p2 = new RandomPlayerAI(streams.p2, { seed: PRNG.convertSeed(aiSeedP2) });
  void p1.start();
  void p2.start();

  let startError: unknown = null;
  Promise.resolve(
    streams.omniscient.write(buildStartBlock(opts.formatid, opts.seed, opts.packedTeams)),
  ).catch((e: unknown) => {
    startError = e;
  });

  const log: string[] = [];
  let winner: string | null = null;
  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split("\n")) {
      if (isTimestampLine(line)) continue;
      log.push(line);
      const w = winnerFromLine(line);
      if (w !== null) winner = w;
    }
  }
  if (startError !== null) throw new Error(`Failed to start battle: ${String(startError)}`);
  return { winner, log };
}
