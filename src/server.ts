import { createApp } from "./http/app.ts";

const app = createApp();
const port = Number(Deno.env.get("PORT") ?? 8080);
Deno.serve({ port }, app.fetch);

export { createApp };
