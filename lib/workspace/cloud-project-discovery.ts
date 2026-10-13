// Read-only provider collectors. Not bound to credentials, persistence or authority.
export type ProjectDiscoveryScope =
  | { provider: "azure-foundry"; tenantId: string; connectionId: string; directoryId: string; endpoint: string }
  | { provider: "google-agent-engine"; tenantId: string; connectionId: string; projectId: string; projectNumber: string; location: string };
export interface ProjectInventoryApi {
  // A trusted transport must independently attest its enrolled scope before reads.
  scopeIdentity(): Promise<unknown>;
  list(input: { parent: string; limit: 100; cursor?: string }): Promise<unknown>;
  listVersions?(input: { parent: string; limit: 100; cursor?: string }): Promise<unknown>;
  get(input: { resource: string }): Promise<unknown>;
}
export interface ProjectObservation {
  scope: ProjectDiscoveryScope;
  resource: string;
  version: string | null;
  identityKind: "unknown" | "service-account" | "agent-identity";
  identityReference: string | null;
  observedAt: string;
  gaps: string[];
  coverage: { ownership: "unmapped"; activity: "unconnected"; enforcement: "unverified" };
}
export interface ProjectInventoryScan {
  scope: ProjectDiscoveryScope; observedAt: string;
  completeness: "partial" | "complete-api-traversal";
  records: ProjectObservation[];
  failures: ("list-unavailable" | "invalid-page" | "invalid-resource" | "detail-unavailable" | "invalid-detail" | "pagination-cycle" | "page-limit")[];
}
const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const segment = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(v);
const cursor = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_+./:=\-]{1,2048}$/.test(v);
export function projectDiscoveryScope(input: ProjectDiscoveryScope): ProjectDiscoveryScope {
  const s = obj(input);
  if (!s || !segment(s.tenantId) || !segment(s.connectionId)) throw Error("Explicit project scope required");
  if (s.provider === "azure-foundry" && Object.keys(s).sort().join() === "connectionId,directoryId,endpoint,provider,tenantId"
    && typeof s.directoryId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s.directoryId)
    && typeof s.endpoint === "string" && /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.services\.ai\.azure\.com\/api\/projects\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(s.endpoint))
    return { provider: s.provider, tenantId: s.tenantId, connectionId: s.connectionId, directoryId: s.directoryId, endpoint: s.endpoint };
  if (s.provider === "google-agent-engine" && Object.keys(s).sort().join() === "connectionId,location,projectId,projectNumber,provider,tenantId"
    && typeof s.projectId === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(s.projectId)
    && typeof s.projectNumber === "string" && /^[1-9][0-9]{5,19}$/.test(s.projectNumber)
    && typeof s.location === "string" && /^[a-z]+-[a-z]+[1-9][0-9]?$/.test(s.location))
    return { provider: s.provider, tenantId: s.tenantId, connectionId: s.connectionId, projectId: s.projectId, projectNumber: s.projectNumber, location: s.location };
  throw Error("Explicit supported project scope required");
}
export async function collectProjectInventory(api: ProjectInventoryApi, input: ProjectDiscoveryScope, at: string): Promise<ProjectInventoryScan> {
  const scope = projectDiscoveryScope(input); // Copy before any await.
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw Error("Explicit observation time required");
  let identity: unknown;
  try { identity = await api.scopeIdentity(); } catch { throw Error("Project identity unavailable"); }
  const actual = obj(identity);
  if (!actual || (scope.provider === "azure-foundry" ? actual.directoryId !== scope.directoryId || actual.endpoint !== scope.endpoint
    : actual.projectId !== scope.projectId || actual.projectNumber !== scope.projectNumber)) throw Error("Project identity differs from enrolled scope");
  const result: ProjectInventoryScan = { scope, observedAt: at, completeness: "partial", records: [], failures: [] };
  const parent = scope.provider === "azure-foundry" ? `${scope.endpoint}/agents` : `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines`;
  const resources = new Set<string>(), agents = new Set<string>(); let pageCalls = 0;
  async function pages(path: string, read: ProjectInventoryApi["list"], visit: (v: unknown) => Promise<void>) {
    const tokens = new Set<string>(); let next: string | undefined;
    for (;;) {
      if (++pageCalls > 40) { result.failures.push("page-limit"); return; }
      let value: unknown;
      try { value = await read({ parent: path, limit: 100, ...(next ? { cursor: next } : {}) }); }
      catch { result.failures.push("list-unavailable"); return; }
      const p = obj(value), rows = p?.[scope.provider === "azure-foundry" ? "data" : "reasoningEngines"];
      // Proto JSON may omit the empty repeated field. Azure requires data/has_more.
      const data = rows === undefined && scope.provider === "google-agent-engine" ? [] : rows;
      if (!p || !Array.isArray(data) || data.length > 100 || (scope.provider === "azure-foundry" && typeof p.has_more !== "boolean")) { result.failures.push("invalid-page"); return; }
      for (const row of data) await visit(row);
      const token = scope.provider === "azure-foundry" ? (p.has_more ? p.last_id : undefined) : p.nextPageToken;
      if (token === undefined || (scope.provider === "google-agent-engine" && token === "")) return;
      if (!cursor(token) || (scope.provider === "azure-foundry" && (!data.length || obj(data.at(-1))?.id !== token))) { result.failures.push("invalid-page"); return; }
      if (tokens.has(token)) { result.failures.push("pagination-cycle"); return; }
      tokens.add(token); next = token;
    }
  }
  async function observe(resource: string, version: string | null, listedId?: string, name?: string) {
    if (resources.has(resource)) { result.failures.push("invalid-resource"); return; }
    resources.add(resource);
    let detail: Record<string, unknown> | null = null;
    try {
      detail = obj(await api.get({ resource }));
      if (!detail || (scope.provider === "azure-foundry" ? detail.object !== "agent.version" || detail.id !== listedId || detail.name !== name || detail.version !== version : detail.name !== resource)) {
        detail = null; result.failures.push("invalid-detail");
      }
    } catch { result.failures.push("detail-unavailable"); }
    let identityKind: ProjectObservation["identityKind"] = "unknown", identityReference: string | null = null;
    if (scope.provider === "google-agent-engine" && detail) {
      const spec = obj(detail.spec), type = spec?.identityType, service = spec?.serviceAccount;
      if (type === "AGENT_IDENTITY" && service === undefined) identityKind = "agent-identity";
      else if ((type === undefined || type === "IDENTITY_TYPE_UNSPECIFIED" || type === "SERVICE_ACCOUNT") && typeof service === "string"
        && new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${scope.projectId}\\.iam\\.gserviceaccount\\.com$`).test(service)) {
        identityKind = "service-account"; identityReference = service;
      }
      if (spec && ((type !== undefined && !["AGENT_IDENTITY", "IDENTITY_TYPE_UNSPECIFIED", "SERVICE_ACCOUNT"].includes(String(type)))
        || (type === "AGENT_IDENTITY" && service !== undefined)
        || (service !== undefined && identityReference === null))) result.failures.push("invalid-detail");
      // Missing default identity is not an invented service account. Conflicting/unknown spec stays unknown.
    }
    result.records.push({ scope: { ...scope }, resource, version, identityKind, identityReference, observedAt: at,
      gaps: [...(!identityReference ? ["workload-principal-unresolved"] : []), ...(version === null ? ["execution-version-unresolved"] : []), "effective-permissions-unknown", "declared-tools-unknown"],
      coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } });
  }
  await pages(parent, api.list.bind(api), async raw => {
    const row = obj(raw);
    if (scope.provider === "google-agent-engine") {
      if (!row || typeof row.name !== "string" || !new RegExp(`^projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines/[a-zA-Z0-9_-]{1,128}$`).test(row.name)) { result.failures.push("invalid-resource"); return; }
      await observe(row.name, null); return;
    }
    if (!row || row.object !== "agent" || typeof row.name !== "string" || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(row.name) || !segment(row.id)
      || agents.has(row.name)) { result.failures.push("invalid-resource"); return; }
    const agentName = row.name;
    agents.add(agentName);
    if (!api.listVersions) { result.failures.push("list-unavailable"); return; }
    await pages(`${parent}/${agentName}/versions`, api.listVersions.bind(api), async rawVersion => {
      const v = obj(rawVersion);
      if (!v || v.object !== "agent.version" || v.name !== agentName || !segment(v.id) || !segment(v.version) || v.draft === true) { result.failures.push("invalid-resource"); return; }
      await observe(`${parent}/${agentName}/versions/${v.version}`, v.version, v.id, agentName);
    });
  });
  if (!result.failures.length) result.completeness = "complete-api-traversal";
  return result;
}
