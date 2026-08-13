import { createApp } from "./http/app.ts";
import { BattleHub } from "./ws/hub.ts";

const gatewayToken = Deno.env.get("GATEWAY_TOKEN");
if (!gatewayToken) throw new Error("GATEWAY_TOKEN must be set before starting the gateway server");

const hub = new BattleHub();
const app = createApp({ battleHub: hub, gatewayToken });
const port = Number(Deno.env.get("PORT") ?? 8080);
const controller = new AbortController();
Deno.serve({ port, signal: controller.signal }, app.fetch);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  controller.abort();
  await hub.shutdown();
}

Deno.addSignalListener("SIGINT", () => void shutdown());
Deno.addSignalListener("SIGTERM", () => void shutdown());

export { createApp };
