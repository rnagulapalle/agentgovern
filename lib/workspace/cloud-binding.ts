import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
import { ControlError } from "../durable/contracts";
import { awsCliInventoryApi, awsCliInvocationApi, discoverySession } from "./cloud-aws-cli";
import { preserveRuntimeInventory, type CloudDiscoveryScope } from "./cloud-discovery";
// Only server configuration chooses the file and executable. No browser secrets,
// planner credential fallback, cloud mutation or execution enrollment exists here.
async function boundReadOptions(scope: CloudDiscoveryScope, path: string | undefined, now: () => number) {
  const expected = preserveRuntimeInventory(null, { scope, observedAt: new Date(now()).toISOString(), completeness: "partial", records: [], failures: [] }).scope;
  async function read() {
    try {
      const value = await readPrivateDiscoveryBinding(path);
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "executable,scope,session") throw Error();
      const binding = value as Record<string, unknown>;
      const checked = preserveRuntimeInventory(null, { scope: binding.scope as CloudDiscoveryScope, observedAt: new Date(now()).toISOString(), completeness: "partial", records: [], failures: [] }).scope;
      if (JSON.stringify(checked) !== JSON.stringify(expected)) throw Error();
      return { executable: binding.executable as string, session: discoverySession(binding.session, now()) };
    } catch { throw new ControlError(503, "Read-only cloud access is unavailable for this connection. Ask your administrator to review its binding."); }
  }
  const first = await read();
  try {
    return { executable: first.executable, region: expected.region, accountId: expected.accountId, now, session: async () => {
      const current = await read();
      if (current.executable !== first.executable) throw new Error("Discovery transport changed");
      return current.session;
    } };
  } catch { throw new ControlError(503, "The reviewed discovery transport is unavailable."); }
}

export async function cloudDiscoveryBinding(scope: CloudDiscoveryScope, path = process.env.LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE, now = Date.now) {
  try { return awsCliInventoryApi(await boundReadOptions(scope, path, now)); }
  catch (error) { if (error instanceof ControlError) throw error; throw new ControlError(503, "The reviewed discovery transport is unavailable."); }
}
export async function cloudObservationBinding(scope: CloudDiscoveryScope, path = process.env.LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE, now = Date.now) {
  try { return awsCliInvocationApi(await boundReadOptions(scope, path, now)); }
  catch (error) { if (error instanceof ControlError) throw error; throw new ControlError(503, "The reviewed observation transport is unavailable."); }
}
