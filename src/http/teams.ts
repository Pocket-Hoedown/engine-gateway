import type { Hono } from "@hono/hono";
import type { BattleFormat } from "../modes/types.ts";
import { getMode } from "../modes/registry.ts";
import { validateTeam } from "../teams/validator.ts";
import type { PhfTeam } from "../teams/types.ts";
import {
  parseShowdownPacked,
  parseShowdownText,
  toShowdownPacked,
  toShowdownText,
} from "../teams/converter.ts";
import { ModeNotFoundError } from "./modes.ts";

type TeamFormat = "phf" | "text" | "packed";

/** Mount the Teams API (validate + convert) onto an existing Hono app. */
export function registerTeamsRoutes(app: Hono): void {
  app.post("/teams/validate", async (c) => {
    const body = await c.req.json() as {
      team: PhfTeam;
      modeId?: string;
      format?: BattleFormat;
      modeConfig?: unknown;
    };
    const mode = getMode(body.modeId ?? "standard");
    if (!mode) throw new ModeNotFoundError(body.modeId ?? "standard");
    const result = validateTeam(body.team, mode, body.format ?? "single", body.modeConfig);
    return c.json(result);
  });

  app.post("/teams/convert", async (c) => {
    const body = await c.req.json() as {
      input: PhfTeam | string;
      from: TeamFormat;
      to: TeamFormat;
    };
    const team = toPhfTeam(body.input, body.from);
    return c.json({ output: fromPhfTeam(team, body.to) });
  });
}

function toPhfTeam(input: PhfTeam | string, from: TeamFormat): PhfTeam {
  if (from === "phf") return input as PhfTeam;
  if (from === "text") return parseShowdownText(input as string);
  return parseShowdownPacked(input as string);
}

function fromPhfTeam(team: PhfTeam, to: TeamFormat): PhfTeam | string {
  if (to === "phf") return team;
  if (to === "text") return toShowdownText(team);
  return toShowdownPacked(team);
}
