/** A Gen-5 sim RNG seed ([number,number,number,number]). */
export type SimSeed = [number, number, number, number];

/** The sim emits `|t:|<unixtime>` wall-clock lines each turn; drop them for deterministic replay. */
export function isTimestampLine(line: string): boolean {
  return line.startsWith("|t:|");
}

/** The winner name from a `|win|` line, or null for any other line. */
export function winnerFromLine(line: string): string | null {
  return line.startsWith("|win|") ? line.slice("|win|".length) : null;
}

/** Whether a line signals a tie. Exact match — must not catch `|teampreview`. */
export function isTieLine(line: string): boolean {
  return line === "|tie" || line.startsWith("|tie|");
}

/** Build the sim `>start` / `>player` command block that opens a battle. */
export function buildStartBlock(
  formatid: string,
  seed: SimSeed,
  packedTeams: [string, string],
  names: [string, string] = ["P1", "P2"],
): string {
  return (
    `>start ${JSON.stringify({ formatid, seed })}\n` +
    `>player p1 ${JSON.stringify({ name: names[0], team: packedTeams[0] })}\n` +
    `>player p2 ${JSON.stringify({ name: names[1], team: packedTeams[1] })}`
  );
}
