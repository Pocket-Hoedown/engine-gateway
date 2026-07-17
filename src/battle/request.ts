import type { ActiveOption, MoveOption, RequestDTO, RequestPokemon } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Raw = any;

/** Normalize the sim `|request|` JSON (the part after `|request|`) into a legal-action DTO. */
export function parseRequest(rawJson: string): RequestDTO {
  const r: Raw = JSON.parse(rawJson);

  const dto: RequestDTO = {
    team: (r.side?.pokemon ?? []).map((p: Raw): RequestPokemon => ({
      ident: p.ident,
      details: p.details,
      condition: p.condition,
      active: !!p.active,
    })),
  };

  if (typeof r.rqid === "number") dto.rqid = r.rqid;
  if (r.teamPreview) dto.teamPreview = true;
  if (r.wait) dto.wait = true;
  if (r.forceSwitch) dto.forceSwitch = r.forceSwitch;
  if (r.active) {
    dto.active = r.active.map((a: Raw): ActiveOption => {
      const opt: ActiveOption = {
        moves: (a.moves ?? []).map((m: Raw): MoveOption => ({
          id: m.id,
          name: m.move,
          pp: m.pp ?? 0,
          maxpp: m.maxpp ?? 0,
          target: m.target ?? "normal",
          disabled: !!m.disabled,
        })),
      };
      if (a.trapped) opt.trapped = true;
      return opt;
    });
  }

  return dto;
}
