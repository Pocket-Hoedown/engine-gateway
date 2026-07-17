import { assert, assertEquals } from "@std/assert";
import {
  buildStartBlock,
  isTieLine,
  isTimestampLine,
  winnerFromLine,
} from "../../src/battle/protocol.ts";

Deno.test("isTimestampLine matches the sim wall-clock line", () => {
  assert(isTimestampLine("|t:|1723857600"));
  assert(!isTimestampLine("|turn|1"));
});

Deno.test("winnerFromLine extracts the winner, null otherwise", () => {
  assertEquals(winnerFromLine("|win|P1"), "P1");
  assertEquals(winnerFromLine("|turn|3"), null);
});

Deno.test("isTieLine matches a tie", () => {
  assert(isTieLine("|tie"));
  assert(!isTieLine("|win|P2"));
});

Deno.test("buildStartBlock builds the 3-line start command", () => {
  const block = buildStartBlock("gen5customgame", [1, 2, 3, 4], ["PACKED_A", "PACKED_B"]);
  const lines = block.split("\n");
  assertEquals(lines.length, 3);
  assert(lines[0].startsWith(">start "));
  assert(lines[0].includes('"formatid":"gen5customgame"'));
  assert(lines[1] === `>player p1 ${JSON.stringify({ name: "P1", team: "PACKED_A" })}`);
  assert(lines[2] === `>player p2 ${JSON.stringify({ name: "P2", team: "PACKED_B" })}`);
});
