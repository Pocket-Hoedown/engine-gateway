import { assert, assertEquals } from "@std/assert";
import { createApp } from "../../src/http/app.ts";

const app = createApp();
const post = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const LEGAL_TEAM = {
  schema: "phf-team/1",
  name: "T",
  gen: 5,
  members: [{
    species: "Tauros",
    ability: "Intimidate",
    nature: "Adamant",
    item: "Leftovers",
    moves: ["Return", "Earthquake", "Rock Slide", "Pursuit"],
    evs: { atk: 252, spe: 252, spd: 4 },
  }],
};

Deno.test("POST /teams/validate accepts a legal team under Standard mode", async () => {
  const res = await post("/teams/validate", { team: LEGAL_TEAM });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.valid, true);
});

Deno.test("POST /teams/validate rejects an illegal team", async () => {
  const team = {
    ...LEGAL_TEAM,
    members: [{
      ...LEGAL_TEAM.members[0],
      moves: ["Horn Drill", "Return", "Earthquake", "Pursuit"],
    }],
  };
  const res = await post("/teams/validate", { team });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.valid, false);
  assert(body.errors.some((e: string) => e.includes("OHKO Clause")));
});

Deno.test("POST /teams/validate 404s for an unknown mode", async () => {
  const res = await post("/teams/validate", { team: LEGAL_TEAM, modeId: "nope" });
  assertEquals(res.status, 404);
});

Deno.test("POST /teams/convert: phf -> text -> phf round-trips", async () => {
  const toText = await post("/teams/convert", { input: LEGAL_TEAM, from: "phf", to: "text" });
  assertEquals(toText.status, 200);
  const { output: text } = await toText.json();
  assert(typeof text === "string" && text.includes("Tauros"));

  const toPhf = await post("/teams/convert", { input: text, from: "text", to: "phf" });
  assertEquals(toPhf.status, 200);
  const { output: phf } = await toPhf.json();
  assertEquals(phf.members[0].species, "Tauros");
});
