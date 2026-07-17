import type { Hono } from "@hono/hono";
import { toID } from "@pkmn/data";
import { SpritePackUnavailableError, type SpriteService } from "../sprites/service.ts";

/** Mount the read-only Gen-5 sprite asset routes onto an existing Hono app. */
export function registerSpriteRoutes(app: Hono, sprites: SpriteService): void {
  // Static route first so it always wins over the `:id` param route.
  app.get("/sprites/gen5/manifest.json", async (c) => {
    if (!sprites.available) throw new SpritePackUnavailableError();
    const body = await Deno.readFile(sprites.manifestPath);
    return c.body(body, 200, { "Content-Type": "application/json; charset=utf-8" });
  });

  app.get("/sprites/gen5/:id", async (c) => {
    const flags = {
      back: c.req.query("back") !== undefined,
      female: c.req.query("female") !== undefined,
      shiny: c.req.query("shiny") !== undefined,
    };
    const { path, contentType } = sprites.resolve(toID(c.req.param("id")), flags);
    const bytes = await Deno.readFile(path);
    return c.body(bytes, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });
}
