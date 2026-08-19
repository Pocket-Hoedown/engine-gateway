import { registerMode } from "./registry.ts";
import { StandardMode } from "./standard.ts";
import { GymLeaderMode } from "./gym_leader.ts";

/** Register the gateway's built-in modes. Idempotent to call multiple times. */
export function registerBuiltinModes(): void {
  registerMode(StandardMode);
  registerMode(GymLeaderMode);
}
