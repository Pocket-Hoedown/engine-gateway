import { assertEquals } from "@std/assert";
import { PushQueue } from "../../src/battle/queue.ts";

Deno.test("PushQueue delivers buffered values then closes", async () => {
  const q = new PushQueue<number>();
  q.push(1);
  q.push(2);
  q.close();
  const got: number[] = [];
  for await (const v of q) got.push(v);
  assertEquals(got, [1, 2]);
});

Deno.test("PushQueue wakes a pending consumer on push", async () => {
  const q = new PushQueue<string>();
  const it = q[Symbol.asyncIterator]();
  const pending = it.next(); // no value yet → pending promise
  q.push("hi");
  assertEquals((await pending).value, "hi");
  q.close();
});
