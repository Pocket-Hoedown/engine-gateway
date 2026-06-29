import { assert, assertEquals } from "@std/assert";
import { createApp } from "../../src/http/app.ts";

const app = createApp();
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

Deno.test("GET /healthz returns ok", async () => {
  const res = await get("/healthz");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test("GET /dex/species returns the dex list", async () => {
  const res = await get("/dex/species");
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body) && body.length > 600);
});

Deno.test("GET /dex/species/:id returns one species", async () => {
  const res = await get("/dex/species/charizard");
  assertEquals(res.status, 200);
  assertEquals((await res.json()).num, 6);
});

Deno.test("GET /dex/species/:id/learnset returns a movepool", async () => {
  const res = await get("/dex/species/charizard/learnset");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, "charizard");
  assert(Array.isArray(body.moves) && body.moves.length > 0);
});

Deno.test("GET /dex/types returns the 17-type chart", async () => {
  const res = await get("/dex/types");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.types.length, 17);
  assertEquals(body.effectiveness.Fire.Water, 0.5);
});

Deno.test("GET /dex/moves/:id resolves a display-cased id", async () => {
  const res = await get("/dex/moves/Thunderbolt");
  assertEquals(res.status, 200);
  assertEquals((await res.json()).id, "thunderbolt");
});

Deno.test("unknown id returns 404 with a structured error", async () => {
  const res = await get("/dex/species/notamon");
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, "not_found");
});
