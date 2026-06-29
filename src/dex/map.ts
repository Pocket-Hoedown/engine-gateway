import type { Ability, Item, Move, Specie } from "@pkmn/data";
import type { AbilityDTO, ItemDTO, MoveDTO, SpeciesDTO } from "./dto.ts";
import { gen } from "./gen.ts";

export function toSpeciesDTO(s: Specie): SpeciesDTO {
  const dto: SpeciesDTO = {
    id: s.id,
    num: s.num,
    name: s.name,
    types: [...s.types],
    baseStats: {
      hp: s.baseStats.hp,
      atk: s.baseStats.atk,
      def: s.baseStats.def,
      spa: s.baseStats.spa,
      spd: s.baseStats.spd,
      spe: s.baseStats.spe,
    },
    abilities: { primary: s.abilities[0] },
    eggGroups: [...s.eggGroups],
    genderRatio: { M: s.genderRatio.M, F: s.genderRatio.F },
    weightkg: s.weightkg,
  };
  if (s.abilities[1]) dto.abilities.secondary = s.abilities[1];
  if (s.abilities.H) dto.abilities.hidden = s.abilities.H;
  if (s.prevo) {
    const prevoSpecies = gen.species.get(s.prevo);
    dto.prevo = prevoSpecies?.id || s.prevo;
  }
  if (s.evos && s.evos.length > 0) {
    dto.evos = s.evos.map((evoName) => {
      const evoSpecies = gen.species.get(evoName);
      return evoSpecies?.id || evoName;
    });
  }
  if (s.baseSpecies && s.baseSpecies !== s.name) dto.baseSpecies = s.baseSpecies;
  if (s.forme) dto.forme = s.forme;
  return dto;
}

export function toMoveDTO(m: Move): MoveDTO {
  return {
    id: m.id,
    num: m.num,
    name: m.name,
    type: m.type,
    category: m.category,
    basePower: m.basePower,
    accuracy: m.accuracy === true ? null : m.accuracy,
    pp: m.pp,
    priority: m.priority,
    target: m.target,
    flags: Object.keys(m.flags),
    shortDesc: m.shortDesc,
    desc: m.desc,
  };
}

export function toAbilityDTO(a: Ability): AbilityDTO {
  return { id: a.id, num: a.num, name: a.name, shortDesc: a.shortDesc, desc: a.desc };
}

export function toItemDTO(i: Item): ItemDTO {
  return { id: i.id, num: i.num, name: i.name, shortDesc: i.shortDesc, desc: i.desc };
}
