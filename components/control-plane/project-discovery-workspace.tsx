"use client";
import { useEffect, useState } from "react";
import { Cloud, UserRound, Cable, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { CloudOwnerReviewCard } from "./cloud-owner-review";
import { workspaceJson } from "@/lib/workspace/response";
import type { CloudDiscoveryOperations } from "@/lib/workspace/cloud-operations";
import type { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
type Connections = Awaited<ReturnType<CloudDiscoveryOperations["projectConnections"]>>;
type Inventory = Awaited<ReturnType<CloudInventoryStore["latestProject"]>>;
export function ProjectDiscoveryWorkspace({ provider }: { provider: "azure-foundry" | "google-agent-engine" }) {
  const [connections, setConnections] = useState<Connections | null>(null), [inventory, setInventory] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const azure = provider === "azure-foundry";
  useEffect(() => {
    let current = true;
    fetch("/api/workspace/discovery?kind=project", { cache: "no-store" }).then(async r => {
      const value = await workspaceJson(r); if (!r.ok) throw Error(value.error); if (current) setConnections(value);
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);
  async function configure(form: HTMLFormElement) {
    const data = new FormData(form); setBusy(true); setError(""); setNotice(""); setInventory(null);
    const fields = azure ? { directoryId: data.get("directoryId"), endpoint: data.get("endpoint") } : { projectId: data.get("projectId"), projectNumber: data.get("projectNumber"), location: data.get("location") };
    try {
      const r = await fetch("/api/workspace/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "configure-project", provider, connectionId: data.get("connectionId"), ...fields }) });
      const value = await workspaceJson(r); if (!r.ok) throw Error(value.error);
      const list = await fetch("/api/workspace/discovery?kind=project", { cache: "no-store" }), saved = await workspaceJson(list); if (!list.ok) throw Error(saved.error);
      setConnections(saved); setNotice("Project scope saved. No cloud connection, agent enrollment or execution permission was created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Project scope could not be saved. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  async function read(id: string) {
    setBusy(true); setError(""); setNotice(""); setInventory(null);
    try {
      const r = await fetch(`/api/workspace/discovery?kind=project&connectionId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const value = await workspaceJson(r); if (!r.ok) throw Error(value.error); setInventory(value);
    } catch (e) { setError(e instanceof Error ? e.message : "Saved evidence could not be loaded."); }
    finally { setBusy(false); }
  }
  async function scan(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/workspace/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "scan-project", connectionId: id }) });
      const value = await workspaceJson(r); if (!r.ok) throw Error(value.error);
      setInventory(value); setNotice("Read-only project scan saved. No agent enrollment or execution permission was created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Project scan could not be verified. Prior evidence remains saved."); }
    finally { setBusy(false); }
  }
  const saved = connections?.connections.filter(c => c.scope.provider === provider);
  return <>
    <section className="cp-panel cp-durable-card"><h2><Cloud size={22} aria-hidden="true" /> {azure ? "Azure Foundry" : "Google Agent Engine"} inventory</h2><p>Save the project scope reviewed by your administrator and inspect saved observations. {azure ? "Azure scanning requires an administrator-reviewed directory and server binding. Configured access is not a verified scan." : "Google scanning requires an administrator-reviewed server binding. Configured access is not a verified scan."}</p><p>Saving a scope does not contact the cloud, import agents or grant execution permission. Enter no passwords, access keys or tokens.</p></section>
    {error && <p role="alert" className="cp-durable-message is-error">{error}</p>}
    {notice && <p role="status" className="cp-durable-message">{notice}</p>}
    <section className="cp-panel cp-durable-card"><h2>Save a project scope</h2>
      <form className="cp-durable-form" onSubmit={e => { e.preventDefault(); void configure(e.currentTarget); }}>
        <label>Connection name<input name="connectionId" required maxLength={64} pattern="[a-zA-Z0-9_-]+" placeholder={azure ? "operations-azure" : "operations-google"} disabled={busy} /></label>
        {azure ? <><label>Directory ID<input name="directoryId" required maxLength={36} placeholder="Reviewed Microsoft directory ID" disabled={busy} /></label><label>Foundry project endpoint<input name="endpoint" type="url" required maxLength={300} placeholder="https://company.services.ai.azure.com/api/projects/ops" disabled={busy} /></label></> : <><label>Project ID<input name="projectId" required maxLength={30} placeholder="company-agents" disabled={busy} /></label><label>Project number<input name="projectNumber" required inputMode="numeric" pattern="[1-9][0-9]{5,19}" maxLength={20} placeholder="Numeric Google project number" disabled={busy} /></label><label>Location<input name="location" required maxLength={32} placeholder="us-central1" disabled={busy} /></label></>}
        <button className="cp-button" disabled={busy || !connections}>Save project scope</button>
      </form>
    </section>
    <section className="cp-panel cp-durable-card"><h2>Saved project connections</h2>
      {!connections && !error && <p role="status">Loading saved project scopes…</p>}
      {saved && !saved.length && <p>No scopes for this provider are shown. This does not mean your cloud has no agents.</p>}
      {connections?.truncated && <p>Showing the first 100 project scopes across providers. Remaining scopes may not appear here; ask your administrator for the full inventory.</p>}
      {saved?.map(c => <div className="cp-durable-card" key={c.scope.connectionId}><h3>{c.scope.connectionId}</h3><p>Scope configured · {c.scope.provider === "azure-foundry" ? "Azure Foundry" : `${c.scope.projectId} · ${c.scope.location}`}</p><p>{c.scanReady ? "Read-only server binding configured. Scan to verify scoped cloud access." : "Native scanning is unavailable: a reviewed supported server binding is required."} A saved scope is not cloud access or enforcement.</p>{c.scanReady && <button className="cp-button" disabled={busy} onClick={() => void scan(c.scope.connectionId)}>Scan project inventory</button>}<button className="cp-button secondary" disabled={busy} onClick={() => void read(c.scope.connectionId)}>Review saved project evidence</button></div>)}
    </section>
    {inventory && <section className="cp-panel cp-durable-card"><h2>{inventory.scope.connectionId}: project evidence</h2>
      <div className="cp-discovery-coverage"><span><UserRound size={18} aria-hidden="true" /> Ownership reviewed per resource</span><span><Cable size={18} aria-hidden="true" /> Activity not connected</span><span><ShieldQuestion size={18} aria-hidden="true" /> Action enforcement not verified</span></div>
      {inventory.status === "no-scan" ? <p>No project scan has been saved. Resources, principals, permissions and tools remain unknown.</p> : <>
        <p>{inventory.completeness === "partial" ? "Partial scan: some reads could not be verified." : "API traversal completed within the saved project scope."} Observed {new Date(inventory.observedAt).toLocaleString()}. {inventory.stale ? "This evidence is stale." : "This is a saved observation, not a live authority check."}</p>
        {inventory.historyTruncated && <p>Showing 2,000 resource versions. Full history remains in the workspace database.</p>}
        {!inventory.records.length && <p>No resource observations were saved. This is not proof of deletion or absence elsewhere.</p>}
        {inventory.records.map(({ record, observedInCurrentScan, stale }) => <article className="cp-durable-card" key={`${record.resource}:${record.version ?? "unresolved"}`}><h3><Cloud size={20} aria-hidden="true" /> {record.scope.provider === "azure-foundry" ? record.resource.split("/").slice(-3)[0] : record.resource.split("/").slice(-1)[0]}</h3><p>{record.version === null ? "Execution version unresolved" : `Provider version ${record.version}`} · Observed {new Date(record.observedAt).toLocaleString()}{stale ? " · Stale" : ""}{!observedInCurrentScan ? " · Retained from an earlier scan" : ""}</p><p>Effective permissions and declared tools remain unknown. This resource is not enrolled for controlled execution.</p><details><summary>Identity references</summary><p style={{ overflowWrap: "anywhere" }}>Resource: {record.resource}</p><p>Identity kind: {record.identityKind}</p><p style={{ overflowWrap: "anywhere" }}>Declared principal: {record.identityReference ?? "Unresolved"}</p><p>A reported identity is not verified workload authority.</p></details><CloudOwnerReviewCard reference={{provider:provider,connectionId:inventory.scope.connectionId,scanId:inventory.scanId,resource:record.resource,version:record.version}} current={observedInCurrentScan && !stale} /></article>)}
      </>}
      <p>Reviewed owner mapping, workload identity and enrollment remain required before controlled execution.</p><Link href="/control-plane/agents" prefetch={false}>View existing scoped workspace agents →</Link>
    </section>}
  </>;
}
