import { join } from "@std/path";
import type { VariantFlags } from "./manifest.ts";

/** Thrown when a requested id/variant has no file in the pack. */
export class SpriteNotFoundError extends Error {
  constructor(id: string) {
    super(`sprite not found: ${id}`);
    this.name = "SpriteNotFoundError";
  }
}

/** Thrown when the pack directory is missing/empty (build step not run). */
export class SpritePackUnavailableError extends Error {
  constructor() {
    super("sprite pack not built — run `deno task build:sprites`");
    this.name = "SpritePackUnavailableError";
  }
}

const CONTENT_TYPES: Record<string, string> = { gif: "image/gif", png: "image/png" };

function stemFor(id: string, f: VariantFlags): string {
  return id + (f.back ? "-b" : "") + (f.female ? "-f" : "") + (f.shiny ? "-s" : "");
}

/** Serves sprite files out of a pre-built pack directory. Scans the dir once at construction. */
export class SpriteService {
  private readonly index = new Map<string, string>(); // stem -> filename (with extension)
  readonly available: boolean;
  readonly manifestPath: string;

  constructor(private readonly dir: string) {
    this.manifestPath = join(dir, "manifest.json");
    let found = false;
    try {
      for (const entry of Deno.readDirSync(dir)) {
        if (!entry.isFile || entry.name === "manifest.json") continue;
        const dot = entry.name.lastIndexOf(".");
        const stem = dot >= 0 ? entry.name.slice(0, dot) : entry.name;
        this.index.set(stem, entry.name);
        found = true;
      }
    } catch {
      // dir missing → stays unavailable
    }
    this.available = found;
  }

  /** Resolve (id, flags) → file path + content type. Female-soft, back/shiny-hard fallback. */
  resolve(id: string, flags: VariantFlags): { path: string; contentType: string } {
    if (!this.available) throw new SpritePackUnavailableError();
    if (!this.index.has(id)) throw new SpriteNotFoundError(id); // no front → unknown id

    let file = this.index.get(stemFor(id, flags));
    if (!file && flags.female) file = this.index.get(stemFor(id, { ...flags, female: false }));
    if (!file) throw new SpriteNotFoundError(`${id} (requested variant)`);

    const ext = file.slice(file.lastIndexOf(".") + 1);
    return {
      path: join(this.dir, file),
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
    };
  }
}
