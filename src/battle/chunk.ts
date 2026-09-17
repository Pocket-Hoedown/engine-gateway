import { isTieLine, isTimestampLine, winnerFromLine } from "./protocol.ts";

export interface ParsedSideChunk {
  trackerLines: string[];
  renderLines: string[];
  requestJson?: string;
  errors: string[];
  terminal?: string | null;
}

export function splitSideChunk(chunk: string): ParsedSideChunk {
  const parsed: ParsedSideChunk = { trackerLines: [], renderLines: [], errors: [] };
  for (const line of chunk.split("\n")) {
    if (!line || isTimestampLine(line)) continue;
    if (line.startsWith("|error|")) {
      parsed.errors.push(line.slice(7));
      continue;
    }
    parsed.trackerLines.push(line);
    if (line.startsWith("|request|")) {
      parsed.requestJson = line.slice(9);
      continue;
    }
    parsed.renderLines.push(line);
    const winner = winnerFromLine(line);
    if (winner !== null) parsed.terminal = winner;
    else if (isTieLine(line)) parsed.terminal = null;
  }
  return parsed;
}
