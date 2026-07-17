# Engine Gateway (①)

Headless Deno/TypeScript service that owns all Pokémon-domain knowledge for Pocket Hoedown —
the sole consumer of `@pkmn/sim`. Serves a read-only Gen-5 Dex API and Gen-5 sprite assets over HTTP.

## Prerequisites

- [Deno](https://deno.com/) (installed at `~/.deno/bin/deno`; not on PATH by default).
- The sibling `../sprites` (Smogon) repo, cloned next to this one, for the sprite build.

## Run

```bash
~/.deno/bin/deno task serve        # starts the HTTP server on PORT (default 8080)
```

## Test

```bash
~/.deno/bin/deno test -A           # full suite
```

## Build the Gen-5 sprite pack

The sprite routes serve a locally-built pack. Generate it once (regenerate after pulling
Smogon updates); the output `assets/` dir is gitignored.

```bash
~/.deno/bin/deno task build:sprites            # reads ../sprites → assets/sprites/gen5/
~/.deno/bin/deno task build:sprites --src /path/to/sprites --out assets/sprites/gen5
```

Until it has run, `/sprites/gen5/*` returns `503 sprites_unavailable`; the Dex API is unaffected.
