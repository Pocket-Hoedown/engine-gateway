import { BattleStreams, PRNG, RandomPlayerAI } from "@pkmn/sim";

export type SimSeed = [number, number, number, number];

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
 * Deterministic for a given (formatid, packedTeams, seed): the battle PRNG
 * and both AI PRNGs are all seeded from `seed`.
 */
export async function runHeadlessBattle(opts: HeadlessBattleOptions): Promise<BattleResult> {
  const battleStream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(battleStream);

  const spec = { formatid: opts.formatid, seed: opts.seed };
  const p1spec = { name: "P1", team: opts.packedTeams[0] };
  const p2spec = { name: "P2", team: opts.packedTeams[1] };

  // Derive distinct-but-deterministic AI seeds from the battle seed.
  // SimSeed is Gen5RNGSeed ([number,number,number,number]); convert to PRNGSeed string for RandomPlayerAI.
  const aiSeedP1: SimSeed = [opts.seed[0] ^ 0x1111, opts.seed[1], opts.seed[2], opts.seed[3]];
  const aiSeedP2: SimSeed = [opts.seed[0] ^ 0x2222, opts.seed[1], opts.seed[2], opts.seed[3]];

  const p1 = new RandomPlayerAI(streams.p1, { seed: PRNG.convertSeed(aiSeedP1) });
  const p2 = new RandomPlayerAI(streams.p2, { seed: PRNG.convertSeed(aiSeedP2) });
  void p1.start();
  void p2.start();

  let startError: unknown = null;
  Promise.resolve(streams.omniscient.write(
    `>start ${JSON.stringify(spec)}\n` +
      `>player p1 ${JSON.stringify(p1spec)}\n` +
      `>player p2 ${JSON.stringify(p2spec)}`,
  )).catch((e: unknown) => { startError = e; });

  const log: string[] = [];
  let winner: string | null = null;
  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split("\n")) {
      // Drop the sim's wall-clock timestamp lines (`|t:|<unixtime>`, emitted each
      // turn): they are not seed-derived, so keeping them would break the same-seed
      // replay guarantee whenever a transcript crosses a one-second boundary.
      if (line.startsWith("|t:|")) continue;
      log.push(line);
      if (line.startsWith("|win|")) winner = line.slice("|win|".length);
    }
  }
  if (startError !== null) throw new Error(`Failed to start battle: ${String(startError)}`);
  return { winner, log };
}
