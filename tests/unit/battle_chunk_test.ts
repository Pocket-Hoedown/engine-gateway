import { assertEquals } from "@std/assert";
import { splitSideChunk } from "../../src/battle/chunk.ts";

Deno.test("chunk retains multiple requests and errors in source order", () => {
  const parsed = splitSideChunk(
    '|error|before\n|request|{"rqid":1}\n|error|between\n|request|{"rqid":2}\n|error|after',
  );
  assertEquals(
    parsed.requestJson,
    undefined,
    "ambiguous requests must not silently select the last",
  );
  assertEquals((parsed as unknown as { entries: unknown }).entries, [
    { kind: "error", message: "before" },
    { kind: "request", json: '{"rqid":1}' },
    { kind: "error", message: "between" },
    { kind: "request", json: '{"rqid":2}' },
    { kind: "error", message: "after" },
  ]);
});

Deno.test("chunk keeps private request for tracker only", () => {
  const secret = '|request|{"side":{"pokemon":[{"item":"Choice Band"}]}}';
  assertEquals(splitSideChunk(`|t:|42\n|turn|3\n${secret}\n|error|bad\n|win|P1`), {
    entries: [
      { kind: "line", line: "|turn|3" },
      { kind: "request", json: secret.slice(9) },
      { kind: "error", message: "bad" },
      { kind: "line", line: "|win|P1" },
    ],
    trackerLines: ["|turn|3", secret, "|win|P1"],
    renderLines: ["|turn|3", "|win|P1"],
    requestJson: secret.slice(9),
    errors: ["bad"],
    terminal: "P1",
  });
  assertEquals(splitSideChunk('|request|{"wait":true}').renderLines, []);
  assertEquals(splitSideChunk("|tie").terminal, null);
});
