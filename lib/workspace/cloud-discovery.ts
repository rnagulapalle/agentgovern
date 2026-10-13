// Read-only collection contract. No enrollment, credential issuance or execution.
export interface CloudDiscoveryScope {
  tenantId: string;
  connectionId: string;
  accountId: string;
  region: string;
}
export interface AwsRuntimeInventoryApi {
  callerIdentity(): Promise<unknown>;
  listRuntimes(input: { maxResults: number; nextToken?: string }): Promise<unknown>;
  getRuntime(input: { agentRuntimeId: string; agentRuntimeVersion: string }): Promise<unknown>;
}
export interface DiscoveredRuntime {
  scope: CloudDiscoveryScope;
  source: "aws-agentcore-runtime";
  resourceId: string;
  resourceArn: string;
  version: string;
  observedAt: string;
  roleReference: string | null;
  workloadIdentityReference: string | null;
  gaps: ("runtime-identity-unavailable" | "effective-permissions-unknown" | "declared-tools-unknown")[];
  coverage: { ownership: "unmapped"; activity: "unconnected"; enforcement: "unverified" };
}
export interface RuntimeInventoryScan {
  scope: CloudDiscoveryScope;
  observedAt: string;
  completeness: "complete-api-traversal" | "partial";
  records: DiscoveredRuntime[];
  failures: ("list-unavailable" | "invalid-page" | "invalid-resource" | "detail-unavailable" | "invalid-detail" | "pagination-cycle" | "page-limit")[];
}
const runtimeId = /^[a-zA-Z][a-zA-Z0-9_]{0,47}-[a-zA-Z0-9]{10}$/;
const version = /^[1-9][0-9]{0,4}$/;
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function scopeCopy(scope: CloudDiscoveryScope): CloudDiscoveryScope {
  if (!scope || Object.keys(scope).sort().join() !== "accountId,connectionId,region,tenantId"
    || typeof scope.tenantId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(scope.tenantId)
    || typeof scope.connectionId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(scope.connectionId)
    || typeof scope.accountId !== "string" || !/^[0-9]{12}$/.test(scope.accountId)
    || typeof scope.region !== "string" || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(scope.region))
    throw new Error("Explicit supported discovery scope required");
  return { tenantId: scope.tenantId, connectionId: scope.connectionId, accountId: scope.accountId, region: scope.region };
}
function observation(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw new Error("Explicit discovery observation time required");
  return value;
}
function listedRuntime(value: unknown, scope: CloudDiscoveryScope) {
  const row = object(value);
  if (!row || typeof row.agentRuntimeId !== "string" || !runtimeId.test(row.agentRuntimeId)
    || typeof row.agentRuntimeVersion !== "string" || !version.test(row.agentRuntimeVersion)
    || row.agentRuntimeArn !== `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:runtime/${row.agentRuntimeId}`)
    return null;
  return { id: row.agentRuntimeId, arn: row.agentRuntimeArn as string, version: row.agentRuntimeVersion };
}
function identityReferences(value: unknown, listed: { id: string; arn: string; version: string }, scope: CloudDiscoveryScope) {
  const row = object(value), actual = listedRuntime(value, scope);
  if (!row || !actual || actual.id !== listed.id || actual.arn !== listed.arn || actual.version !== listed.version) return null;
  const role = typeof row.roleArn === "string" && row.roleArn.startsWith(`arn:aws:iam::${scope.accountId}:role/`)
    && /^arn:aws:iam::[0-9]{12}:role\/[a-zA-Z0-9_+=,.@/-]{1,512}$/.test(row.roleArn) ? row.roleArn : null;
  const identity = object(row.workloadIdentityDetails)?.workloadIdentityArn;
  const prefix = `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:workload-identity-directory/`;
  const workload = typeof identity === "string" && identity.startsWith(prefix)
    && /^[a-zA-Z0-9_:/.-]{1,1024}$/.test(identity) ? identity : null;
  return { roleReference: role, workloadIdentityReference: workload };
}
export async function collectAwsRuntimeInventory(api: AwsRuntimeInventoryApi, input: CloudDiscoveryScope, at: string): Promise<RuntimeInventoryScan> {
  // Copy before awaiting: caller mutation cannot redirect an enrolled scan.
  const scope = scopeCopy(input), observedAt = observation(at);
  let identity: Record<string, unknown> | null;
  try { identity = object(await api.callerIdentity()); }
  catch { throw new Error("Discovery caller identity unavailable"); }
  if (identity?.Account !== scope.accountId) throw new Error("Discovery caller account differs from enrolled scope");
  const result: RuntimeInventoryScan = { scope, observedAt, completeness: "partial", records: [], failures: [] };
  const tokens = new Set<string>(), resources = new Set<string>();
  let nextToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    let value: unknown;
    try { value = await api.listRuntimes({ maxResults: 100, ...(nextToken ? { nextToken } : {}) }); }
    catch { result.failures.push("list-unavailable"); return result; }
    const response = object(value);
    if (!response || !Array.isArray(response.agentRuntimes) || response.agentRuntimes.length > 100) {
      result.failures.push("invalid-page"); return result;
    }
    for (const raw of response.agentRuntimes) {
      const listed = listedRuntime(raw, scope);
      if (!listed || resources.has(listed.id)) { result.failures.push("invalid-resource"); continue; }
      resources.add(listed.id);
      let references: ReturnType<typeof identityReferences> = null;
      try {
        const detail = await api.getRuntime({ agentRuntimeId: listed.id, agentRuntimeVersion: listed.version });
        references = identityReferences(detail, listed, scope);
        if (!references) result.failures.push("invalid-detail");
      } catch { result.failures.push("detail-unavailable"); }
      // Never retain raw responses, environment values, descriptions or headers.
      result.records.push({ scope: { ...scope }, source: "aws-agentcore-runtime", resourceId: listed.id,
        resourceArn: listed.arn, version: listed.version, observedAt,
        roleReference: references?.roleReference ?? null, workloadIdentityReference: references?.workloadIdentityReference ?? null,
        gaps: [...(!references?.roleReference || !references?.workloadIdentityReference ? ["runtime-identity-unavailable" as const] : []),
          "effective-permissions-unknown", "declared-tools-unknown"],
        coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } });
    }
    if (response.nextToken === undefined || response.nextToken === null) {
      if (!result.failures.length) result.completeness = "complete-api-traversal";
      return result;
    }
    if (typeof response.nextToken !== "string" || !/^\S{1,2048}$/.test(response.nextToken)) {
      result.failures.push("invalid-page"); return result;
    }
    if (tokens.has(response.nextToken)) { result.failures.push("pagination-cycle"); return result; }
    tokens.add(response.nextToken); nextToken = response.nextToken;
  }
  result.failures.push("page-limit"); return result;
}
// Inventory history is evidence, not authority. Even an exhausted API traversal
// does not establish transactional absence or authorize removal/revocation.
export function preserveRuntimeInventory(previous: RuntimeInventoryScan | null, current: RuntimeInventoryScan) {
  const scope = scopeCopy(current.scope);
  observation(current.observedAt);
  if (!["partial", "complete-api-traversal"].includes(current.completeness)) throw new Error("Inventory completeness unavailable");
  if (previous && JSON.stringify(scopeCopy(previous.scope)) !== JSON.stringify(scope))
    throw new Error("Inventory connection scope differs");
  const latest = new Set(current.records.map(r => `${r.resourceArn}:${r.version}`));
  const records = new Map<string, { record: DiscoveredRuntime; observedInCurrentScan: boolean }>();
  for (const record of [...(previous?.records ?? []), ...current.records]) {
    if (JSON.stringify(scopeCopy(record.scope)) !== JSON.stringify(scope)
      || !listedRuntime({ agentRuntimeId: record.resourceId, agentRuntimeArn: record.resourceArn, agentRuntimeVersion: record.version }, scope))
      throw new Error("Inventory record scope differs");
    if (Object.keys(record).sort().join() !== "coverage,gaps,observedAt,resourceArn,resourceId,roleReference,scope,source,version,workloadIdentityReference"
      || record.source !== "aws-agentcore-runtime"
      || JSON.stringify(record.coverage) !== JSON.stringify({ ownership: "unmapped", activity: "unconnected", enforcement: "unverified" }))
      throw new Error("Inventory evidence cannot carry authority or raw metadata");
    observation(record.observedAt);
    const references = identityReferences({ agentRuntimeId: record.resourceId, agentRuntimeArn: record.resourceArn,
      agentRuntimeVersion: record.version, roleArn: record.roleReference,
      workloadIdentityDetails: { workloadIdentityArn: record.workloadIdentityReference } },
    { id: record.resourceId, arn: record.resourceArn, version: record.version }, scope)!;
    const gaps = [...(!references.roleReference || !references.workloadIdentityReference ? ["runtime-identity-unavailable"] : []), "effective-permissions-unknown", "declared-tools-unknown"];
    if (references.roleReference !== record.roleReference || references.workloadIdentityReference !== record.workloadIdentityReference
      || JSON.stringify(record.gaps) !== JSON.stringify(gaps)) throw new Error("Inventory identity evidence differs");
    const key = `${record.resourceArn}:${record.version}`;
    records.set(key, { record: structuredClone(record), observedInCurrentScan: latest.has(key) });
  }
  return { scope, completeness: current.completeness, observedAt: current.observedAt, records: [...records.values()] };
}
