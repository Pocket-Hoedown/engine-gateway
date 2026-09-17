import { assertEquals, assertThrows } from "@std/assert";
import { PendingRequestGuard } from "../../src/battle/request_guard.ts";
import { BattleRequestError } from "../../src/battle/types.ts";

Deno.test("pending request guard rejects stale or missing known rqid without consuming", () => {
  const guard = new PendingRequestGuard();
  const id = guard.open("a", 12);
  assertThrows(() => guard.consume("a", 13), BattleRequestError, "stale request");
  assertThrows(() => guard.consume("a"), BattleRequestError, "stale request");
  assertEquals(guard.consume("a", 12), id);
});

Deno.test("pending request guard consumes rqid-less requests once", () => {
  const guard = new PendingRequestGuard();
  const id = guard.open("a");
  assertEquals(guard.consume("a"), id);
  assertThrows(() => guard.consume("a"), BattleRequestError, "no pending request");
});

Deno.test("pending request guard isolates controllers and clears pending requests", () => {
  const guard = new PendingRequestGuard();
  assertThrows(() => guard.consume("a"), BattleRequestError, "no pending request");
  guard.open("a", 0);
  guard.open("b");
  guard.clear("a");
  assertThrows(() => guard.consume("a", 0), BattleRequestError, "no pending request");
  guard.consume("b");
  const id = guard.open("a", 0);
  assertEquals(guard.consume("a", 0), id);
  const next = guard.open("a");
  assertEquals(next > id, true);
  guard.consume("a");
});
