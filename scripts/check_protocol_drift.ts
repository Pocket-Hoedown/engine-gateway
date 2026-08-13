import { PROTOCOL_BINDINGS_SHA256, PROTOCOL_GIT_COMMIT } from "../src/ws/protocol.ts";

const gatewayRoot = new URL("../", import.meta.url);
const canonicalRoot = new URL("../protocol/", gatewayRoot);
const relativeBinding = "src/gen/pocket_hoedown/v1/battle_pb.ts";
const vendored = new URL("src/ws/gen/pocket_hoedown/v1/battle_pb.ts", gatewayRoot);
const canonical = new URL(relativeBinding, canonicalRoot);

async function sha256(path: URL): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await Deno.readFile(path));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

const command = new Deno.Command("git", {
  args: ["-C", canonicalRoot.pathname, "rev-parse", "HEAD"],
  stdout: "piped",
  stderr: "inherit",
});
const result = await command.output();
if (!result.success) Deno.exit(result.code);
const commit = new TextDecoder().decode(result.stdout).trim();
const canonicalHash = await sha256(canonical);
const vendoredHash = await sha256(vendored);

const failures: string[] = [];
if (commit !== PROTOCOL_GIT_COMMIT) {
  failures.push(`protocol commit ${commit} does not match ${PROTOCOL_GIT_COMMIT}`);
}
if (canonicalHash !== PROTOCOL_BINDINGS_SHA256) {
  failures.push(`canonical binding hash ${canonicalHash} does not match metadata`);
}
if (vendoredHash !== PROTOCOL_BINDINGS_SHA256) {
  failures.push(`vendored binding hash ${vendoredHash} does not match metadata`);
}
if (canonicalHash !== vendoredHash) {
  failures.push("vendored binding differs from canonical binding");
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  Deno.exit(1);
}
