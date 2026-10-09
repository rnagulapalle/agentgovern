import { projectDiscoveryScope, type ProjectDiscoveryScope, type ProjectInventoryApi } from "./cloud-project-discovery";
import { boundedProjectJson, projectReadSession, projectCredential, type ProjectReadSession } from "./cloud-project-http";
export { projectReadSession, type ProjectReadSession } from "./cloud-project-http";
// Server-only adapter. Credentials must come from an explicitly configured,
// reviewed broker; no browser token, ambient login or planner fallback exists.
export function googleProjectInventoryApi(input: ProjectDiscoveryScope, session: (signal: AbortSignal) => Promise<ProjectReadSession>, options: { fetch?: typeof fetch; now?: () => number } = {}): ProjectInventoryApi {
  const checked = projectDiscoveryScope(input), transport = options.fetch ?? fetch, now = options.now ?? Date.now;
  if (checked.provider !== "google-agent-engine" || typeof session !== "function") throw Error("Explicit Google discovery binding required");
  const scope = checked;
  const parent = `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines`;
  const resourcePattern = new RegExp(`^${parent}/[a-zA-Z0-9_-]{1,128}$`);
  const origin = `https://${scope.location}-aiplatform.googleapis.com/v1/`;
  const projectUrl = `https://cloudresourcemanager.googleapis.com/v3/projects/${scope.projectNumber}`;
  async function read(url?: string) {
    try {
      const signal = AbortSignal.timeout(15_000);
      const value = await projectCredential(session, signal);
      const token = projectReadSession(value, now()).token; // Snapshot before verification + read.
      // One shared deadline and one credential snapshot cover verification + read.
      signal.throwIfAborted();
      const project = await boundedProjectJson(projectUrl, token, signal, transport);
      if (project.name !== `projects/${scope.projectNumber}` || project.projectId !== scope.projectId || project.state !== "ACTIVE") throw Error();
      return url ? await boundedProjectJson(url, token, signal, transport) : { projectId: scope.projectId, projectNumber: scope.projectNumber };
    } catch { throw Error("Verified read-only project access unavailable"); }
  }
  return {
    scopeIdentity: () => read(),
    list: p => {
      if (!p || Object.keys(p).some(k => !["parent", "limit", "cursor"].includes(k)) || p.parent !== parent || p.limit !== 100
        || (p.cursor !== undefined && (typeof p.cursor !== "string" || !/^[a-zA-Z0-9_+./:=\-]{1,2048}$/.test(p.cursor))))
        return Promise.reject(Error("Invalid project page request"));
      const url = new URL(origin + parent); url.searchParams.set("pageSize", "100");
      if (p.cursor) url.searchParams.set("pageToken", p.cursor);
      return read(url.href);
    },
    get: p => {
      if (!p || Object.keys(p).sort().join() !== "resource" || typeof p.resource !== "string" || !resourcePattern.test(p.resource))
        return Promise.reject(Error("Invalid project resource request"));
      return read(origin + p.resource);
    },
  };
}
