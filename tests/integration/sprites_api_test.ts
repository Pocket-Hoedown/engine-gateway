import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createApp } from "../../src/http/app.ts";

async function fixtureApp(): Promise<(path: string) => Promise<Response>> {
  const dir = await Deno.makeTempDir();
  for (const f of ["bulbasaur.gif", "bulbasaur-b.gif", "bulbasaur-s.gif"]) {
    await Deno.writeTextFile(join(dir, f), "GIF89a");
  }
  const manifest = {
    gen: 5,
    generatedAt: "t",
    source: "smogon/sprites",
    count: 1,
    sprites: { bulbasaur: { back: true, shiny: true, female: false } },
  };
  await Deno.writeTextFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  const app = createApp({ spritePackDir: dir });
  return (path) => Promise.resolve(app.fetch(new Request(`http://localhost${path}`)));
}

Deno.test("GET /sprites/gen5/:id serves the sprite with cache headers", async () => {
  const get = await fixtureApp();
  const res = await get("/sprites/gen5/bulbasaur");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/gif");
  assert(res.headers.get("cache-control")?.includes("immutable"));
  await res.arrayBuffer(); // drain body
});

Deno.test("variant flags select the file; female soft-falls back to base", async () => {
  const get = await fixtureApp();
  const shiny = await get("/sprites/gen5/bulbasaur?shiny");
  assertEquals(shiny.status, 200);
  await shiny.arrayBuffer();
  const female = await get("/sprites/gen5/Bulbasaur?female"); // display-cased id, no female → base
  assertEquals(female.status, 200);
  await female.arrayBuffer();
});

Deno.test("unknown id → 404 not_found envelope", async () => {
  const get = await fixtureApp();
  const res = await get("/sprites/gen5/notamon");
  assertEquals(res.status, 404);
  assertEquals((await res.json()).error.code, "not_found");
});

Deno.test("GET /sprites/gen5/manifest.json returns the manifest", async () => {
  const get = await fixtureApp();
  const res = await get("/sprites/gen5/manifest.json");
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sprites.bulbasaur.back, true);
});

Deno.test("no pack → sprite routes 503 while the Dex still boots", async () => {
  const app = createApp({ spritePackDir: "/nonexistent/pack" });
  const get = (p: string) => app.fetch(new Request(`http://localhost${p}`));
  const sprite = await get("/sprites/gen5/bulbasaur");
  assertEquals(sprite.status, 503);
  assertEquals((await sprite.json()).error.code, "sprites_unavailable");
  assertEquals((await get("/healthz")).status, 200);
  const dex = await get("/dex/species/charizard");
  assertEquals(dex.status, 200);
  await dex.arrayBuffer();
});
