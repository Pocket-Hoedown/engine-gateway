import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { buildSpritePack } from "../../src/sprites/pipeline.ts";

Deno.test("buildSpritePack copies renamed files and writes a manifest", async () => {
  const src = await Deno.makeTempDir();
  const out = await Deno.makeTempDir();
  await Deno.mkdir(join(src, "data"), { recursive: true });
  const g5 = join(src, "src", "sprites", "gen5");
  await Deno.mkdir(g5, { recursive: true });

  // Real gen(5) ids so the join hits the live accessor.
  const species = {
    s32: { num: 1, formeNum: 0, base: "Bulbasaur", forme: "", sid: "s32" },
    s96: { num: 3, formeNum: 0, base: "Venusaur", forme: "", sid: "s96" },
  };
  await Deno.writeTextFile(join(src, "data", "species.json"), JSON.stringify(species));
  for (const f of ["s32.gif", "s32-b.gif", "s96.gif", "s96-f.gif"]) {
    await Deno.writeTextFile(join(g5, f), "GIF89a"); // stand-in bytes
  }

  const report = await buildSpritePack({ srcDir: src, outDir: out }); // minSpecies default 0
  assertEquals(report.count, 2);
  assertEquals(report.files, 4);
  assert(report.bytes > 0);

  assertEquals((await Deno.stat(join(out, "bulbasaur.gif"))).isFile, true);
  assertEquals((await Deno.stat(join(out, "venusaur-f.gif"))).isFile, true);

  const manifest = JSON.parse(await Deno.readTextFile(join(out, "manifest.json")));
  assertEquals(manifest.gen, 5);
  assertEquals(manifest.count, 2);
  assertEquals(manifest.sprites.bulbasaur, { back: true, shiny: false, female: false });
  assertEquals(manifest.sprites.venusaur, { back: false, shiny: false, female: true });
});

Deno.test("buildSpritePack enforces the sanity floor", async () => {
  const src = await Deno.makeTempDir();
  const out = await Deno.makeTempDir();
  await Deno.mkdir(join(src, "data"), { recursive: true });
  await Deno.mkdir(join(src, "src", "sprites", "gen5"), { recursive: true });
  await Deno.writeTextFile(join(src, "data", "species.json"), JSON.stringify({}));

  let threw = false;
  try {
    await buildSpritePack({ srcDir: src, outDir: out, minSpecies: 600 });
  } catch {
    threw = true;
  }
  assert(threw);
});
