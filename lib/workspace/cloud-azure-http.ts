import { projectDiscoveryScope, type ProjectDiscoveryScope, type ProjectInventoryApi } from "./cloud-project-discovery";
import { projectReadSession, projectCredential, boundedProjectJson } from "./cloud-project-http";
export interface AzureProjectReadSession { token: string; expiresAt: string; directoryId: string; endpoint: string; audience: "https://ai.azure.com" }
// Only an administrator-configured supported broker may supply this association.
// The native API validates its opaque token. This client never decodes a JWT or
// establishes workload authority/effective permissions from provider metadata.
export function azureProjectInventoryApi(input: ProjectDiscoveryScope, acquire: (signal: AbortSignal) => Promise<AzureProjectReadSession>, options: { fetch?: typeof fetch; now?: () => number } = {}): ProjectInventoryApi {
  const checked = projectDiscoveryScope(input), now = options.now ?? Date.now, transport = options.fetch ?? fetch;
  if (checked.provider !== "azure-foundry" || typeof acquire !== "function") throw Error("Explicit Azure discovery binding required");
  const scope = checked, parent = `${scope.endpoint}/agents`, segment = "[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}";
  const versionParent = new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${segment}/versions$`);
  const resource = new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/${segment}/versions/${segment}$`);
  async function read(url: string) {
    try {
      const signal = AbortSignal.timeout(15_000);
      const value = await projectCredential(acquire, signal);
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "audience,directoryId,endpoint,expiresAt,token" || value.directoryId !== scope.directoryId || value.endpoint !== scope.endpoint || value.audience !== "https://ai.azure.com") throw Error();
      const token = projectReadSession({ token: value.token, expiresAt: value.expiresAt }, now()).token;
      signal.throwIfAborted();
      const result = await boundedProjectJson(url, token, signal, transport);
      return { result, association: { directoryId: scope.directoryId, endpoint: scope.endpoint } };
    } catch { throw Error("Verified read-only Azure project access unavailable"); }
  }
  function page(p: { parent: string; limit: 100; cursor?: string }, versions: boolean) {
    if (!p || Object.keys(p).some(k => !["parent", "limit", "cursor"].includes(k)) || typeof p.parent !== "string" || (versions ? !versionParent.test(p.parent) : p.parent !== parent) || p.limit !== 100
      || (p.cursor !== undefined && (typeof p.cursor !== "string" || !/^[a-zA-Z0-9_+./:=\-]{1,2048}$/.test(p.cursor)))) return Promise.reject(Error("Invalid Azure project page request"));
    const url = new URL(p.parent); url.searchParams.set("api-version", "v1"); url.searchParams.set("limit", "100");
    if (p.cursor) url.searchParams.set("after", p.cursor);
    if (versions) url.searchParams.set("include_drafts", "false");
    return read(url.href).then(v => v.result);
  }
  return {
    scopeIdentity: async () => {
      const url = new URL(parent); url.searchParams.set("api-version", "v1"); url.searchParams.set("limit", "1");
      const observed = await read(url.href);
      if (!Array.isArray(observed.result.data) || observed.result.data.length > 1 || typeof observed.result.has_more !== "boolean") throw Error("Verified read-only Azure project access unavailable");
      return observed.association; // Broker-attested directory + successful fixed native read, not API-returned directory identity.
    },
    list: p => page(p, false), listVersions: p => page(p, true),
    get: p => {
      if (!p || Object.keys(p).sort().join() !== "resource" || typeof p.resource !== "string" || !resource.test(p.resource)) return Promise.reject(Error("Invalid Azure project resource request"));
      const url = new URL(p.resource); url.searchParams.set("api-version", "v1");
      return read(url.href).then(v => v.result);
    },
  };
}
