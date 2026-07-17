import { assert, assertEquals, assertThrows } from "@std/assert";
import { join } from "@std/path";
import {
  SpriteNotFoundError,
  SpritePackUnavailableError,
  SpriteService,
} from "../../src/sprites/service.ts";

async function fixturePack(files: string[]): Promise<string> {
  const dir = await Deno.makeTempDir();
  for (const f of files) await Deno.writeTextFile(join(dir, f), "x");
  return dir;
}

Deno.test("resolve builds the variant stem and returns the file + content type", async () => {
  const dir = await fixturePack(["bulbasaur.gif", "bulbasaur-b.gif", "bulbasaur-b-s.gif"]);
  const s = new SpriteService(dir);
  assert(s.available);
  assertEquals(
    s.resolve("bulbasaur", { back: true, female: false, shiny: true }).path,
    join(dir, "bulbasaur-b-s.gif"),
  );
  assertEquals(
    s.resolve("bulbasaur", { back: false, female: false, shiny: false }).contentType,
    "image/gif",
  );
});

Deno.test("female is a soft axis: absent female falls back to base", async () => {
  const dir = await fixturePack(["pikachu.gif", "pikachu-b.gif"]); // no female files
  const s = new SpriteService(dir);
  assertEquals(
    s.resolve("pikachu", { back: false, female: true, shiny: false }).path,
    join(dir, "pikachu.gif"),
  );
  assertEquals(
    s.resolve("pikachu", { back: true, female: true, shiny: false }).path,
    join(dir, "pikachu-b.gif"),
  );
});

Deno.test("back/shiny are hard axes: absent variant throws SpriteNotFoundError", async () => {
  const dir = await fixturePack(["pikachu.gif"]); // front only
  const s = new SpriteService(dir);
  assertThrows(
    () => s.resolve("pikachu", { back: true, female: false, shiny: false }),
    SpriteNotFoundError,
  );
});

Deno.test("unknown id throws SpriteNotFoundError", async () => {
  const dir = await fixturePack(["pikachu.gif"]);
  const s = new SpriteService(dir);
  assertThrows(
    () => s.resolve("missingno", { back: false, female: false, shiny: false }),
    SpriteNotFoundError,
  );
});

Deno.test("missing pack dir is unavailable and throws SpritePackUnavailableError", () => {
  const s = new SpriteService("/nonexistent/pack/dir");
  assert(!s.available);
  assertThrows(
    () => s.resolve("pikachu", { back: false, female: false, shiny: false }),
    SpritePackUnavailableError,
  );
});
