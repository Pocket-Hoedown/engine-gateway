import { Hono } from "@hono/hono";
import {
  DexNotFoundError,
  getAbility,
  getItem,
  getLearnset,
  getMove,
  getSpecies,
  getTypeChart,
  listAbilities,
  listItems,
  listMoves,
  listSpecies,
} from "../dex/service.ts";

/** Build the read-only Dex HTTP app. Stateless; safe to call once per process or per test. */
export function createApp(): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.get("/dex/species", (c) => c.json(listSpecies()));
  app.get("/dex/species/:id", (c) => c.json(getSpecies(c.req.param("id"))));
  app.get("/dex/species/:id/learnset", async (c) => c.json(await getLearnset(c.req.param("id"))));

  app.get("/dex/moves", (c) => c.json(listMoves()));
  app.get("/dex/moves/:id", (c) => c.json(getMove(c.req.param("id"))));

  app.get("/dex/abilities", (c) => c.json(listAbilities()));
  app.get("/dex/abilities/:id", (c) => c.json(getAbility(c.req.param("id"))));

  app.get("/dex/items", (c) => c.json(listItems()));
  app.get("/dex/items/:id", (c) => c.json(getItem(c.req.param("id"))));

  app.get("/dex/types", (c) => c.json(getTypeChart()));

  app.onError((err, c) => {
    if (err instanceof DexNotFoundError) {
      return c.json({ error: { code: "not_found", message: err.message } }, 404);
    }
    throw err; // unexpected → Hono's default 500
  });

  return app;
}
