import { assertThrows } from "@std/assert";
import { PendingRequestGuard } from "../../src/battle/request_guard.ts";
import { BattleRequestError } from "../../src/battle/types.ts";

for (const rqid of [0, 12]) {
  Deno.test(`pending request guard preserves known rqid ${rqid} after rejection`, () => {
    const guard = new PendingRequestGuard();
    guard.open("a", rqid);
    assertThrows(() => guard.consume("a", rqid + 1), BattleRequestError, "stale request");
    assertThrows(() => guard.consume("a"), BattleRequestError, "stale request");
    guard.consume("a", rqid);
    assertThrows(() => guard.consume("a", rqid), BattleRequestError, "no pending request");
  });
}

Deno.test("pending request guard consumes rqid-less requests once", () => {
  const guard = new PendingRequestGuard();
  guard.open("a");
  guard.consume("a");
  assertThrows(() => guard.consume("a"), BattleRequestError, "no pending request");
});

Deno.test("pending request guard rejects only consumed requests without replacing newer ones", () => {
  const guard = new PendingRequestGuard();
  guard.open("a", 0);
  guard.consume("a", 0);
  guard.reject("a");
  guard.consume("a", 0);
  guard.open("a", 1);
  guard.reject("a");
  assertThrows(() => guard.consume("a", 0), BattleRequestError, "stale request");
  guard.consume("a", 1);
  guard.clear("a");
  guard.reject("a");
  assertThrows(() => guard.consume("a", 1), BattleRequestError, "no pending request");
  guard.open("a", 2);
  guard.consume("a", 2);
});

Deno.test("pending request guard isolates controllers and clears pending requests", () => {
  const guard = new PendingRequestGuard();
  guard.open("a", 0);
  guard.open("b");
  guard.clear("a");
  assertThrows(() => guard.consume("a", 0), BattleRequestError, "no pending request");
  guard.consume("b");
  guard.open("a", 0);
  guard.consume("a", 0);
});
