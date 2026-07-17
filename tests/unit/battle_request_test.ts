import { assert, assertEquals } from "@std/assert";
import { parseRequest } from "../../src/battle/request.ts";

// Shapes captured from the spike (2026-07-17).
const TEAM_PREVIEW = JSON.stringify({
  teamPreview: true,
  side: {
    name: "P1",
    id: "p1",
    pokemon: [{ ident: "p1: Pikachu", details: "Pikachu, M", condition: "211/211", active: true }],
  },
});

const ACTIVE = JSON.stringify({
  active: [{
    moves: [
      { move: "Thunderbolt", id: "thunderbolt", pp: 24, maxpp: 24, target: "normal", disabled: false },
      { move: "Quick Attack", id: "quickattack", pp: 48, maxpp: 48, target: "normal", disabled: false },
    ],
  }],
  side: {
    name: "P1",
    id: "p1",
    pokemon: [{ ident: "p1: Pikachu", details: "Pikachu, M", condition: "211/211", active: true }],
  },
});

Deno.test("parseRequest normalizes a team-preview request", () => {
  const dto = parseRequest(TEAM_PREVIEW);
  assertEquals(dto.teamPreview, true);
  assertEquals(dto.rqid, undefined);
  assertEquals(dto.active, undefined);
  assertEquals(dto.team[0].ident, "p1: Pikachu");
});

Deno.test("parseRequest normalizes an active request (name<-move, own team)", () => {
  const dto = parseRequest(ACTIVE);
  assert(dto.active && dto.active.length === 1);
  const m = dto.active[0].moves[0];
  assertEquals(m.id, "thunderbolt");
  assertEquals(m.name, "Thunderbolt");
  assertEquals(m.maxpp, 24);
  assertEquals(m.target, "normal");
  assertEquals(dto.team[0].ident, "p1: Pikachu");
});
