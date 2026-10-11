import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { projectDiscoveryScope, type ProjectDiscoveryScope } from "./cloud-project-discovery";
import { projectReadSession } from "./cloud-project-http";
import type { AzureProjectReadSession } from "./cloud-azure-http";

const unavailable = () => new Error("Reviewed Azure discovery credentials unavailable");
export async function validateAzureBrokerPaths(executable: string, configDirectory: string): Promise<void> {
  for (const path of [executable, configDirectory]) {
    if (typeof path !== "string" || !/^\/[a-zA-Z0-9_./-]{1,512}$/.test(path) || path.split("/").includes("..")) throw unavailable();
  }
  try {
    const [binary, directory] = await Promise.all([lstat(executable), lstat(configDirectory)]);
    const uid = process.getuid?.();
    if (uid === undefined || !binary.isFile() || binary.isSymbolicLink() || binary.uid !== uid || (binary.mode & 0o022) || !(binary.mode & 0o100)
      || !directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== uid || (directory.mode & 0o077)) throw unavailable();
  } catch { throw unavailable(); }
}
// These paths are server-owned administrator configuration, never browser input.
// CLI authentication is separate from both planner and execution credentials.
export function azureCliReadBroker(input: ProjectDiscoveryScope, options: {
  executable: string; configDirectory: string; now?: () => number;
}): (signal: AbortSignal) => Promise<AzureProjectReadSession> {
  const checked = projectDiscoveryScope(input), now = options.now ?? Date.now;
  if (checked.provider !== "azure-foundry") throw unavailable();
  const scope = checked, { executable, configDirectory } = options;
  for (const path of [executable, configDirectory]) {
    if (typeof path !== "string" || !/^\/[a-zA-Z0-9_./-]{1,512}$/.test(path) || path.split("/").includes("..")) throw unavailable();
  }
  const env = {
    PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C.UTF-8", NODE_ENV: "production" as const,
    AZURE_CONFIG_DIR: configDirectory, AZURE_CORE_COLLECT_TELEMETRY: "false",
    AZURE_EXTENSION_USE_DYNAMIC_INSTALL: "no", AZURE_CORE_NO_COLOR: "true",
  };
  async function run(args: string[], signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      execFile(executable, args, { env, signal, timeout: 15_000, maxBuffer: 65_536, killSignal: "SIGKILL", encoding: "utf8" }, (error, stdout) => {
        if (error) { reject(unavailable()); return; }
        try { resolve(JSON.parse(stdout)); } catch { reject(unavailable()); }
      });
    });
  }
  return async signal => {
    try {
      signal.throwIfAborted();
      await validateAzureBrokerPaths(executable, configDirectory);
      // Reject sovereign/custom clouds. No selected subscription/profile or cloud
      // is silently changed, and unsupported CLI authentication modes get no fallback.
      const cloud = await run(["cloud", "show", "--output", "json", "--only-show-errors", "--query", "{name:name,authority:endpoints.activeDirectory,management:endpoints.resourceManager}"], signal);
      if (!cloud || typeof cloud !== "object" || Array.isArray(cloud)) throw unavailable();
      const observed = cloud as Record<string, unknown>;
      if (Object.keys(observed).sort().join() !== "authority,management,name" || observed.name !== "AzureCloud"
        || observed.authority !== "https://login.microsoftonline.com" || observed.management !== "https://management.azure.com/") throw unavailable();
      const value = await run(["account", "get-access-token", "--tenant", scope.directoryId, "--resource", "https://ai.azure.com", "--output", "json", "--only-show-errors",
        "--query", "{token:accessToken,expires:expires_on,tenant:tenant,type:tokenType}"], signal);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
      const result = value as Record<string, unknown>;
      if (Object.keys(result).sort().join() !== "expires,tenant,token,type" || result.tenant !== scope.directoryId || result.type !== "Bearer"
        || !((typeof result.expires === "number" && Number.isSafeInteger(result.expires)) || (typeof result.expires === "string" && /^[0-9]{10}$/.test(result.expires)))) throw unavailable();
      const session = projectReadSession({ token: result.token, expiresAt: new Date(Number(result.expires) * 1000).toISOString() }, now());
      signal.throwIfAborted();
      return { ...session, directoryId: scope.directoryId, endpoint: scope.endpoint, audience: "https://ai.azure.com" };
    } catch { throw unavailable(); }
  };
}
