import { ControlError } from "../durable/contracts";
import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
import { googleProjectInventoryApi, projectReadSession } from "./cloud-google-http";
import { projectDiscoveryScope, type ProjectDiscoveryScope } from "./cloud-project-discovery";
// This explicit read-only binding never uses planner credentials or browser input.
// Native Resource Manager verifies project identity before every inventory read.
export async function googleProjectDiscoveryBinding(input: ProjectDiscoveryScope, path = process.env.LOOPLABS_GOOGLE_DISCOVERY_BINDING_FILE, options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const scope = projectDiscoveryScope(input), now = options.now ?? Date.now;
  if (scope.provider !== "google-agent-engine") throw new ControlError(503, "Reviewed Google discovery access is unavailable.");
  async function read(signal?: AbortSignal) {
    try {
      signal?.throwIfAborted();
      const value = await readPrivateDiscoveryBinding(path);
      signal?.throwIfAborted();
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "scope,session") throw Error();
      const binding = value as Record<string, unknown>, actual = projectDiscoveryScope(binding.scope as ProjectDiscoveryScope);
      if (JSON.stringify(actual) !== JSON.stringify(scope)) throw Error();
      return projectReadSession(binding.session, now());
    } catch { throw new ControlError(503, "Reviewed Google discovery access is unavailable."); }
  }
  await read(); // Validate configuration without contacting the provider.
  return googleProjectInventoryApi(scope, signal => read(signal), options);
}
