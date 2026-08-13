# Engine Gateway (①)

Headless Deno/TypeScript service that owns all Pokémon-domain knowledge for Pocket Hoedown — the
sole consumer of `@pkmn/sim`. Serves a read-only Gen-5 Dex API and Gen-5 sprite assets over HTTP.

## Prerequisites

- [Deno](https://deno.com/) (installed at `~/.deno/bin/deno`; not on PATH by default).
- The sibling `../sprites` (Smogon) repo, cloned next to this one, for the sprite build.

## Run

```bash
GATEWAY_TOKEN=replace-me ~/.deno/bin/deno task serve
```

`GATEWAY_TOKEN` is required. It authenticates the multiplexed binary Protobuf WebSocket endpoint at
`GET /ws/battles`; all existing REST routes remain public. Do not log or commit the token.

## Test

```bash
~/.deno/bin/deno test -A           # full suite
~/.deno/bin/deno task protocol:drift # verify the private protocol snapshot is current
```

## Protocol snapshot

The canonical schema and protobuf-es generation live in the private sibling `../protocol` repository
(`Pocket-Hoedown/engine-gateway-protocol`). Until the project is public, the gateway vendors only
its generated TypeScript binding under `src/ws/gen/`. `protocol:drift` requires that sibling
checkout and verifies its exact commit and generated-file SHA-256 against the vendored metadata. Do
not replace this with a local path dependency or hand-edit generated files.

## Build the Gen-5 sprite pack

The sprite routes serve a locally-built pack. Generate it once (regenerate after pulling Smogon
updates); the output `assets/` dir is gitignored.

```bash
~/.deno/bin/deno task build:sprites            # reads ../sprites → assets/sprites/gen5/
~/.deno/bin/deno task build:sprites --src /path/to/sprites --out assets/sprites/gen5
```

Until it has run, `/sprites/gen5/*` returns `503 sprites_unavailable`; the Dex API is unaffected.
