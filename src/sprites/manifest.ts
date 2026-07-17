/** Which non-default variants exist for a species. Front always exists if the id is listed. */
export interface SpriteEntry {
  back: boolean;
  shiny: boolean;
  female: boolean;
}

/** Client-facing availability contract written alongside the pack. */
export interface SpriteManifest {
  gen: number;
  generatedAt: string;
  source: string;
  count: number;
  sprites: Record<string, SpriteEntry>;
}

/** A requested sprite variant — each axis independently on/off. */
export interface VariantFlags {
  back: boolean;
  female: boolean;
  shiny: boolean;
}
