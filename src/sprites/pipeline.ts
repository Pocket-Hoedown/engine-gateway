import { join } from "@std/path";
import { gen } from "../dex/gen.ts";
import { planSpritePack, type SmogonSpecies } from "./plan.ts";
import type { SpriteManifest } from "./manifest.ts";

export interface BuildOptions {
  srcDir: string; // Smogon repo root (holds data/ and src/sprites/gen5/)
  outDir: string; // where the pack is written
  minSpecies?: number; // sanity floor; throw if fewer species kept (default 0)
}

export interface BuildReport {
  count: number; // species kept
  files: number; // files copied
  bytes: number; // total bytes copied
}

/** Filter the Smogon repo to the gen(5) subset and write a self-contained pack + manifest. */
export async function buildSpritePack(opts: BuildOptions): Promise<BuildReport> {
  const species = JSON.parse(
    await Deno.readTextFile(join(opts.srcDir, "data", "species.json")),
  ) as Record<string, SmogonSpecies>;

  const spriteDir = join(opts.srcDir, "src", "sprites", "gen5");
  const files = new Set<string>();
  for await (const e of Deno.readDir(spriteDir)) if (e.isFile) files.add(e.name);

  const genIds = new Set<string>();
  for (const s of gen.species) genIds.add(s.id);

  const { copies, sprites } = planSpritePack(species, genIds, files);
  const count = Object.keys(sprites).length;
  if (count < (opts.minSpecies ?? 0)) {
    throw new Error(
      `sprite plan kept only ${count} species (< ${opts.minSpecies}); check --src (${opts.srcDir})`,
    );
  }

  await Deno.remove(opts.outDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(opts.outDir, { recursive: true });

  let bytes = 0;
  for (const { from, to } of copies) {
    const dst = join(opts.outDir, to);
    await Deno.copyFile(join(spriteDir, from), dst);
    bytes += (await Deno.stat(dst)).size;
  }

  const manifest: SpriteManifest = {
    gen: 5,
    generatedAt: new Date().toISOString(),
    source: "smogon/sprites",
    count,
    sprites,
  };
  await Deno.writeTextFile(
    join(opts.outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  return { count, files: copies.length, bytes };
}

async function main() {
  const args = new Map<string, string>();
  for (let i = 0; i < Deno.args.length - 1; i += 2) {
    args.set(Deno.args[i].replace(/^--/, ""), Deno.args[i + 1]);
  }
  const srcDir = args.get("src") ?? "../sprites";
  const outDir = args.get("out") ?? "assets/sprites/gen5";
  const report = await buildSpritePack({ srcDir, outDir, minSpecies: 600 });
  console.log(
    `Built ${outDir}: ${report.count} species, ${report.files} files, ` +
      `${(report.bytes / 1_048_576).toFixed(1)} MiB`,
  );
}

if (import.meta.main) await main();
