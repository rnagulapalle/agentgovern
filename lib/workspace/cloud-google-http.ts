import { projectDiscoveryScope, type ProjectDiscoveryScope, type ProjectInventoryApi } from "./cloud-project-discovery";
export interface ProjectReadSession { token: string; expiresAt: string }
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
  async function request(url: string, token: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response | undefined;
    try {
      response = await transport(url, { method: "GET", redirect: "manual", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal });
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error();
      const length = response.headers.get("content-length");
      if (length !== null && (!/^[0-9]{1,10}$/.test(length) || Number(length) > 1_048_576)) throw Error();
      if (!response.body) throw Error();
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.length;
          if (bytes > 1_048_576 || signal.aborted) throw Error();
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
      return value;
    } catch {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
      throw Error("Read-only cloud response unavailable"); // No raw error, body, URL or token.
    }
  }
  async function read(url?: string) {
    try {
      const signal = AbortSignal.timeout(15_000);
      const value = await new Promise<ProjectReadSession>((resolve, reject) => {
        const abort = () => reject(Error("Discovery credential deadline reached"));
        signal.addEventListener("abort", abort, { once: true });
        Promise.resolve().then(() => session(signal)).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
      const remaining = typeof value?.expiresAt === "string" ? Date.parse(value.expiresAt) - now() : NaN;
      if (!value || Object.keys(value).sort().join() !== "expiresAt,token" || typeof value.token !== "string"
        || !/^[a-zA-Z0-9_.~+/-]{16,16384}={0,2}$/.test(value.token) || !Number.isFinite(remaining) || remaining < 30_000 || remaining > 3_600_000) throw Error();
      const token = value.token; // A broker mutation cannot switch credentials after verification.
      // One shared deadline and one credential snapshot cover verification + read.
      signal.throwIfAborted();
      const project = await request(projectUrl, token, signal);
      if (project.name !== `projects/${scope.projectNumber}` || project.projectId !== scope.projectId || project.state !== "ACTIVE") throw Error();
      return url ? await request(url, token, signal) : { projectId: scope.projectId, projectNumber: scope.projectNumber };
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
