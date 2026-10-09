import { projectDiscoveryScope, type ProjectInventoryScan, type ProjectObservation } from "./cloud-project-discovery";
const keys = (v: object) => Object.keys(v).sort().join();
const failureKinds = ["list-unavailable", "invalid-page", "invalid-resource", "detail-unavailable", "invalid-detail", "pagination-cycle", "page-limit"];
export function canonicalProjectScan(input: ProjectInventoryScan): ProjectInventoryScan {
  if (!input || keys(input) !== "completeness,failures,observedAt,records,scope" || !["partial", "complete-api-traversal"].includes(input.completeness)
    || !Array.isArray(input.records) || input.records.length > 4000 || !Array.isArray(input.failures) || input.failures.length > 10000
    || input.failures.some(v => !failureKinds.includes(v)) || (input.completeness === "complete-api-traversal" && input.failures.length)
    || typeof input.observedAt !== "string" || !Number.isFinite(Date.parse(input.observedAt)) || new Date(input.observedAt).toISOString() !== input.observedAt)
    throw Error("Valid minimized project evidence required");
  const scope = projectDiscoveryScope(input.scope), seen = new Set<string>();
  const records = input.records.map(r => {
    if (!r || keys(r) !== "coverage,gaps,identityKind,identityReference,observedAt,resource,scope,version" || JSON.stringify(projectDiscoveryScope(r.scope)) !== JSON.stringify(scope)
      || r.observedAt !== input.observedAt || (!r.coverage || keys(r.coverage) !== "activity,enforcement,ownership" || r.coverage.ownership !== "unmapped" || r.coverage.activity !== "unconnected" || r.coverage.enforcement !== "unverified")
      || typeof r.resource !== "string" || !["unknown", "service-account", "agent-identity"].includes(r.identityKind)) throw Error("Project evidence scope or authority differs");
    if (scope.provider === "azure-foundry") {
      const prefix = scope.endpoint + "/agents/", suffix = r.resource.slice(prefix.length);
      if (!r.resource.startsWith(prefix) || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\/versions\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(suffix)
        || typeof r.version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(r.version) || !r.resource.endsWith(`/versions/${r.version}`)
        || r.identityKind !== "unknown" || r.identityReference !== null) throw Error("Azure project evidence differs");
    } else {
      if (!new RegExp(`^projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines/[a-zA-Z0-9_-]{1,128}$`).test(r.resource) || r.version !== null
        || (r.identityKind === "service-account" ? typeof r.identityReference !== "string" || !new RegExp(`^[a-z][a-z0-9-]{4,28}[a-z0-9]@${scope.projectId}\\.iam\\.gserviceaccount\\.com$`).test(r.identityReference) : r.identityReference !== null)) throw Error("Google project evidence differs");
    }
    const gaps = [...(!r.identityReference ? ["workload-principal-unresolved"] : []), ...(r.version === null ? ["execution-version-unresolved"] : []), "effective-permissions-unknown", "declared-tools-unknown"];
    if (JSON.stringify(r.gaps) !== JSON.stringify(gaps)) throw Error("Project evidence gaps differ");
    const key = `${r.resource}\u0000${r.version ?? ""}`;
    if (seen.has(key)) throw Error("Duplicate project observation"); seen.add(key);
    const result: ProjectObservation = { scope: { ...scope }, resource: r.resource, version: r.version, identityKind: r.identityKind, identityReference: r.identityReference, observedAt: r.observedAt, gaps,
      coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } };
    return result;
  }).sort((a, b) => `${a.resource}:${a.version ?? ""}`.localeCompare(`${b.resource}:${b.version ?? ""}`));
  return { scope, observedAt: input.observedAt, completeness: input.completeness, records, failures: [...input.failures] };
}
