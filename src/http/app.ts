import { Hono } from "@hono/hono";
import { z } from "zod";
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
import { registerSpriteRoutes } from "./sprites.ts";
import {
  SpriteNotFoundError,
  SpritePackUnavailableError,
  SpriteService,
} from "../sprites/service.ts";
import { BattleHub } from "../ws/hub.ts";
import { registerBattleWebSocketRoute, type WebSocketUpgrader } from "../ws/routes.ts";
import { ModeNotFoundError, ModeSchemaNotFoundError, registerModeRoutes } from "./modes.ts";
import { registerTeamsRoutes } from "./teams.ts";
import { registerBuiltinModes } from "../modes/builtin.ts";

registerBuiltinModes();

export interface AppOptions {
  /** Directory of the built sprite pack. Defaults to $SPRITE_PACK_DIR or `assets/sprites/gen5`. */
  spritePackDir?: string;
  battleHub?: BattleHub;
  gatewayToken?: string;
  upgradeWebSocket?: WebSocketUpgrader;
}

/** Build the read-only Dex + sprite HTTP app. Stateless; safe to call once per process or per test. */
export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();

  if (opts.battleHub && opts.gatewayToken) {
    registerBattleWebSocketRoute(app, opts.battleHub, opts.gatewayToken, opts.upgradeWebSocket);
  }

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

  registerModeRoutes(app);
  registerTeamsRoutes(app);

  const sprites = new SpriteService(
    opts.spritePackDir ?? Deno.env.get("SPRITE_PACK_DIR") ?? "assets/sprites/gen5",
  );
  registerSpriteRoutes(app, sprites);

  app.onError((err, c) => {
    if (
      err instanceof DexNotFoundError || err instanceof SpriteNotFoundError ||
      err instanceof ModeNotFoundError || err instanceof ModeSchemaNotFoundError
    ) {
      return c.json({ error: { code: "not_found", message: err.message } }, 404);
    }
    if (err instanceof SpritePackUnavailableError) {
      return c.json({ error: { code: "sprites_unavailable", message: err.message } }, 503);
    }
    if (err instanceof z.ZodError) {
      return c.json(
        { error: { code: "invalid_config", message: z.prettifyError(err), issues: err.issues } },
        400,
      );
    }
    throw err; // unexpected → Hono's default 500
  });

  return app;
}
