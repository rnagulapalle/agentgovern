import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { ControlError } from "../durable/contracts";
import { awsCliInventoryApi, discoverySession } from "./cloud-aws-cli";
import { preserveRuntimeInventory, type CloudDiscoveryScope } from "./cloud-discovery";
// Only server configuration chooses the file and executable. No browser secrets,
// planner credential fallback, cloud mutation or execution enrollment exists here.
export async function cloudDiscoveryBinding(scope: CloudDiscoveryScope, path = process.env.LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE, now = Date.now) {
  const expected = preserveRuntimeInventory(null, { scope, observedAt: new Date(now()).toISOString(), completeness: "partial", records: [], failures: [] }).scope;
  async function read() {
    try {
      if (!path || !path.startsWith("/")) throw new Error("Explicit binding required");
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const s = await file.stat();
        const uid = process.getuid?.();
        if (uid === undefined || !s.isFile() || s.uid !== uid || (s.mode & 0o077) !== 0 || s.nlink !== 1 || s.size > 65536) throw new Error("Private binding required");
        const bytes = Buffer.alloc(65537), result = await file.read(bytes, 0, bytes.length, 0);
        if (result.bytesRead > 65536) throw new Error("Bounded binding required");
        const value = JSON.parse(bytes.subarray(0, result.bytesRead).toString("utf8"));
        if (!value || Object.keys(value).sort().join() !== "executable,scope,session") throw new Error("Exact binding required");
        const checked = preserveRuntimeInventory(null, { scope: value.scope, observedAt: new Date(now()).toISOString(), completeness: "partial", records: [], failures: [] }).scope;
        if (JSON.stringify(checked) !== JSON.stringify(expected)) throw new Error("Binding scope differs");
        return { executable: value.executable as string, session: discoverySession(value.session, now()) };
      } finally { await file.close(); }
    } catch { throw new ControlError(503, "Read-only cloud access is unavailable for this connection. Ask your administrator to review its binding."); }
  }
  const first = await read();
  try {
    return awsCliInventoryApi({ executable: first.executable, region: expected.region, now, session: async () => {
      const current = await read();
      if (current.executable !== first.executable) throw new Error("Discovery transport changed");
      return current.session;
    } });
  } catch { throw new ControlError(503, "The reviewed discovery transport is unavailable."); }
}
