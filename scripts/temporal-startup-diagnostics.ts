// Disposable proof diagnostics: fixed categories/booleans only, never raw errors/logs/config values.
export function startupCategories(log:string){
 const bounded=log.slice(0,200000);
 return Object.fromEntries(Object.entries({
  scopedWorkloadUnavailable:/Scoped workload installation unavailable\./g,
  scopedWorkloadRequired:/Scoped workload installation required\./g,
  workloadIdentityRefused:/Wrong workload identity/g,
  packagedArtifactRefused:/Deployment build ID does not match packaged artifacts/g,
  workloadConfigurationMissing:/Missing workload configuration/g,
  tenantBindingUnavailable:/Tenant (?:context|pool|binding) unavailable/g,
  transportRefused:/Verified.*transport required|PostgreSQL transport refused/g,
  tlsHostnameRefused:/ERR_TLS_CERT_ALTNAME_INVALID/g,
  tlsUntrusted:/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|CERT_HAS_EXPIRED/g,
  connectionRefused:/ECONNREFUSED/g,
  permissionRefused:/permission denied/gi,
 }).map(([key,pattern])=>[key,[...bounded.matchAll(pattern)].length]));
}
export function workloadPublicationPresence(env:Readonly<Record<string,string|undefined>>){
 return Object.fromEntries(['LOOPLABS_WORKLOAD_INSTALLATION_FILE','LOOPLABS_WORKSPACE_ID','LOOPLABS_RECOVERY_EPOCH','LOOPLABS_TENANT_DATABASE_ROLE','LOOPLABS_TENANT_DATABASE_SCHEMA'].map(key=>[key,Boolean(env[key])]));
}
