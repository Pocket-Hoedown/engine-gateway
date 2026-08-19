import type { Hono } from "@hono/hono";
import { z } from "zod";
import { getMode, listModes } from "../modes/registry.ts";

export class ModeNotFoundError extends Error {
  constructor(id: string) {
    super(`mode not found: ${id}`);
    this.name = "ModeNotFoundError";
  }
}

export class ModeSchemaNotFoundError extends Error {
  constructor(id: string) {
    super(`mode ${id} has no config schema`);
    this.name = "ModeSchemaNotFoundError";
  }
}

function modeSummary(mode: ReturnType<typeof getMode>) {
  if (!mode) return mode;
  return {
    id: mode.id,
    name: mode.name,
    description: mode.description,
    battleFormats: mode.battleFormats,
    supportsDerivePool: !!mode.derivePool,
    hasConfigSchema: !!mode.configSchema,
  };
}

/** Mount the read-only mode registry routes onto an existing Hono app. */
export function registerModeRoutes(app: Hono): void {
  app.get("/modes", (c) => c.json(listModes().map(modeSummary)));

  app.get("/modes/:id", (c) => {
    const mode = getMode(c.req.param("id"));
    if (!mode) throw new ModeNotFoundError(c.req.param("id"));
    return c.json(modeSummary(mode));
  });

  app.get("/modes/:id/schema", (c) => {
    const mode = getMode(c.req.param("id"));
    if (!mode) throw new ModeNotFoundError(c.req.param("id"));
    if (!mode.configSchema) throw new ModeSchemaNotFoundError(mode.id);
    return c.json(z.toJSONSchema(mode.configSchema));
  });

  app.post("/modes/:id/derive-pool", async (c) => {
    const mode = getMode(c.req.param("id"));
    if (!mode) throw new ModeNotFoundError(c.req.param("id"));
    if (!mode.derivePool) {
      return c.json(
        { error: { code: "unsupported", message: `mode ${mode.id} has no pool` } },
        400,
      );
    }
    const config = await c.req.json();
    return c.json({ pool: mode.derivePool(config) });
  });
}
