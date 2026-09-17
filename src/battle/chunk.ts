import { isTieLine, isTimestampLine, winnerFromLine } from "./protocol.ts";

export type SideChunkEntry =
  | { kind: "line"; line: string }
  | { kind: "request"; json: string }
  | { kind: "error"; message: string };

export interface ParsedSideChunk {
  entries: SideChunkEntry[];
  trackerLines: string[];
  renderLines: string[];
  requestJson?: string;
  errors: string[];
  terminal?: string | null;
}

export function splitSideChunk(chunk: string): ParsedSideChunk {
  const parsed: ParsedSideChunk = { entries: [], trackerLines: [], renderLines: [], errors: [] };
  let requestCount = 0;
  for (const line of chunk.split("\n")) {
    if (!line || isTimestampLine(line)) continue;
    if (line.startsWith("|error|")) {
      parsed.errors.push(line.slice(7));
      parsed.entries.push({ kind: "error", message: line.slice(7) });
      continue;
    }
    parsed.trackerLines.push(line);
    if (line.startsWith("|request|")) {
      requestCount++;
      parsed.entries.push({ kind: "request", json: line.slice(9) });
      if (requestCount === 1) parsed.requestJson = line.slice(9);
      else delete parsed.requestJson;
      continue;
    }
    parsed.entries.push({ kind: "line", line });
    parsed.renderLines.push(line);
    const winner = winnerFromLine(line);
    if (winner !== null) parsed.terminal = winner;
    else if (isTieLine(line)) parsed.terminal = null;
  }
  return parsed;
}
