import { assertEquals } from "@std/assert";
import { splitSideChunk } from "../../src/battle/chunk.ts";

Deno.test("chunk keeps private request for tracker only", () => {
  const secret = '|request|{"side":{"pokemon":[{"item":"Choice Band"}]}}';
  assertEquals(splitSideChunk(`|t:|42\n|turn|3\n${secret}\n|error|bad\n|win|P1`), {
    trackerLines: ["|turn|3", secret, "|win|P1"],
    renderLines: ["|turn|3", "|win|P1"],
    requestJson: secret.slice(9),
    errors: ["bad"],
    terminal: "P1",
  });
  assertEquals(splitSideChunk('|request|{"wait":true}').renderLines, []);
  assertEquals(splitSideChunk("|tie").terminal, null);
});
