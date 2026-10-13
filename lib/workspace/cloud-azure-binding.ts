import { ControlError } from "../durable/contracts";
import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
import { azureCliReadBroker, validateAzureBrokerPaths } from "./cloud-azure-cli";
import { azureProjectInventoryApi } from "./cloud-azure-http";
import { projectDiscoveryScope, type ProjectDiscoveryScope } from "./cloud-project-discovery";

export async function azureProjectDiscoveryBinding(input: ProjectDiscoveryScope, path = process.env.LOOPLABS_AZURE_DISCOVERY_BINDING_FILE, options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const scope = projectDiscoveryScope(input);
  if (scope.provider !== "azure-foundry") throw new ControlError(503, "Reviewed Azure discovery access is unavailable.");
  async function read(signal?: AbortSignal) {
    try {
      signal?.throwIfAborted();
      const value = await readPrivateDiscoveryBinding(path);
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "configDirectory,executable,scope") throw Error();
      const actual = value as Record<string, unknown>, checked = projectDiscoveryScope(actual.scope as ProjectDiscoveryScope);
      if (JSON.stringify(checked) !== JSON.stringify(scope) || typeof actual.executable !== "string" || typeof actual.configDirectory !== "string") throw Error();
      await validateAzureBrokerPaths(actual.executable, actual.configDirectory);
      signal?.throwIfAborted();
      return { executable: actual.executable, configDirectory: actual.configDirectory };
    } catch { throw new ControlError(503, "Reviewed Azure discovery access is unavailable."); }
  }
  const first = await read(); // Local validation only: no CLI process or cloud access.
  return azureProjectInventoryApi(scope, async signal => {
    const current = await read(signal);
    if (current.executable !== first.executable || current.configDirectory !== first.configDirectory) throw Error("Reviewed Azure discovery binding changed");
    return azureCliReadBroker(scope, { ...current, now: options.now })(signal);
  }, options);
}
