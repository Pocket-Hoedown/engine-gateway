import { assert, assertEquals } from "@std/assert";
import { createApp } from "../../src/http/app.ts";

const app = createApp();
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const post = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

Deno.test("GET /modes lists built-in modes", async () => {
  const res = await get("/modes");
  assertEquals(res.status, 200);
  const body = await res.json();
  const ids = body.map((m: { id: string }) => m.id);
  assert(ids.includes("standard"));
  assert(ids.includes("gym-leader"));
});

Deno.test("GET /modes/:id returns one mode", async () => {
  const res = await get("/modes/standard");
  assertEquals(res.status, 200);
  assertEquals((await res.json()).id, "standard");
});

Deno.test("GET /modes/:id 404s for an unknown mode", async () => {
  const res = await get("/modes/nope");
  assertEquals(res.status, 404);
});

Deno.test("POST /modes/gym-leader/derive-pool returns a species pool", async () => {
  const res = await post("/modes/gym-leader/derive-pool", { type: "Electric" });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body.pool) && body.pool.includes("pikachu"));
});

Deno.test("POST /modes/gym-leader/derive-pool 400s on a config that fails the schema", async () => {
  const res = await post("/modes/gym-leader/derive-pool", { type: 5 });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, "invalid_config");
  assert(Array.isArray(body.error.issues) && body.error.issues.length > 0);
});

Deno.test("POST /modes/standard/derive-pool 400s (unsupported)", async () => {
  const res = await post("/modes/standard/derive-pool", {});
  assertEquals(res.status, 400);
});

Deno.test("GET /modes/gym-leader/schema returns a JSON Schema for the config", async () => {
  const res = await get("/modes/gym-leader/schema");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.type, "object");
  assert(body.properties.type);
  assert(body.required.includes("type"));
});

Deno.test("GET /modes/standard/schema 404s (Standard has no config)", async () => {
  const res = await get("/modes/standard/schema");
  assertEquals(res.status, 404);
});
