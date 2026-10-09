"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud, ShieldQuestion, UserRound, Cable } from "lucide-react";
import { PageTitle } from "./ui";
import { workspaceJson } from "@/lib/workspace/response";
import type { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
import type { CloudDiscoveryOperations } from "@/lib/workspace/cloud-operations";
import "./discovery-workspace.css";
type Connections = Awaited<ReturnType<CloudDiscoveryOperations["connections"]>>;
type Inventory = Awaited<ReturnType<CloudInventoryStore["latest"]>>;
const date = (at: string) => new Date(at).toLocaleString();
export function DiscoveryWorkspace() {
  const [connections, setConnections] = useState<Connections | null>(null), [inventory, setInventory] = useState<Inventory | null>(null);
  const [selected, setSelected] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => {
    let current = true;
    fetch("/api/workspace/discovery", { cache: "no-store" }).then(async r => {
      const value = await workspaceJson(r); if (!r.ok) throw new Error(value.error);
      if (current) setConnections(value);
    }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, []);
  async function read(connectionId: string) {
    setBusy(true); setError(""); setInventory(null); setSelected(connectionId); setNotice("");
    try {
      const r = await fetch(`/api/workspace/discovery?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store" });
      const value = await workspaceJson(r); if (!r.ok) throw new Error(value.error); setInventory(value);
    } catch (e) { setError(e instanceof Error ? e.message : "Saved discovery evidence could not be loaded."); }
    finally { setBusy(false); }
  }
  async function configure(form: HTMLFormElement) {
    const values = new FormData(form); setBusy(true); setError(""); setNotice(""); setInventory(null); setSelected("");
    try {
      const r = await fetch("/api/workspace/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "configure", connectionId: values.get("connectionId"), accountId: values.get("accountId"), region: values.get("region") }) });
      const value = await workspaceJson(r); if (!r.ok) throw new Error(value.error);
      const listing = await fetch("/api/workspace/discovery", { cache: "no-store" }), saved = await workspaceJson(listing);
      if (!listing.ok) throw new Error(saved.error); setConnections(saved); setNotice("Discovery scope saved. No cloud connection, agent enrollment or execution permission was created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the discovery scope. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  async function scan(connectionId: string) {
    setBusy(true); setError(""); setNotice(""); setInventory(null); setSelected(connectionId);
    try {
      const r = await fetch("/api/workspace/discovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "scan", connectionId }) });
      const value = await workspaceJson(r); if (!r.ok) throw new Error(value.error); setInventory(value);
    } catch (e) { setError(e instanceof Error ? e.message : "The scan could not be verified. Refresh saved evidence before trying again."); }
    finally { setBusy(false); }
  }
  return <div className="cp-durable cp-discovery">
    <PageTitle eyebrow="CLOUD INVENTORY" title="Discover agents" description="Review saved cloud inventory before deciding which agents should enter your control plane." />
    <section className="cp-panel cp-durable-card"><h2><Cloud size={22} aria-hidden="true" /> AWS AgentCore discovery</h2><p>This candidate supports saved AWS account and region scopes plus read-only inventory evidence. Scanning requires a reviewed server binding. Azure and Google discovery are not available.</p><p>Saving a scope does not contact AWS or import agents. A configured binding allows read-only scans; it does not prove cloud permissions or enable controlled execution.</p></section>
    {error && <p role="alert" className="cp-durable-message is-error">{error}</p>}
    {notice && <p role="status" className="cp-durable-message">{notice}</p>}
    <section className="cp-panel cp-durable-card"><h2>Save a discovery scope</h2><p>Use the account and region reviewed by your workspace administrator. Enter no passwords, access keys or tokens.</p>
      <form className="cp-durable-form" onSubmit={e => { e.preventDefault(); void configure(e.currentTarget); }}>
        <label>Connection name<input name="connectionId" required maxLength={64} pattern="[a-zA-Z0-9_-]+" placeholder="operations-aws" disabled={busy} /></label>
        <label>AWS account ID<input name="accountId" required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="12-digit account ID" disabled={busy} /></label>
        <label>AWS region<input name="region" required pattern="[a-z]{2}-[a-z]+-[1-9]" maxLength={32} placeholder="us-west-2" disabled={busy} /></label>
        <button className="cp-button" disabled={busy || !connections}>Save discovery scope</button>
      </form>
    </section>
    <section className="cp-panel cp-durable-card"><h2>Saved connections</h2>
      {!connections && !error && <p role="status">Loading saved scopes…</p>}
      {connections && !connections.connections.length && <p>No discovery scopes have been saved. This does not mean your cloud has no agents.</p>}
      {connections?.truncated && <p>Showing the first 100 saved scopes. Ask your administrator for the remaining inventory.</p>}
      {connections?.connections.map(c => <div className="cp-durable-card" key={c.scope.connectionId}><h3>{c.scope.connectionId}</h3><p>Account {c.scope.accountId} · {c.scope.region} · Scope configured</p><p>{c.scanReady ? "Read-only binding configured. Cloud identity will be checked during the scan." : "Scanning unavailable. Ask your administrator to configure reviewed read-only access."}</p><div className="cp-discovery-actions"><button className="cp-button secondary" disabled={busy} onClick={() => void read(c.scope.connectionId)}>Review saved evidence</button>{c.scanReady && <button className="cp-button" disabled={busy} onClick={() => void scan(c.scope.connectionId)}>Scan cloud inventory</button>}</div></div>)}
    </section>
    {selected && busy && <p role="status">Loading saved evidence…</p>}
    {inventory && <section className="cp-panel cp-durable-card"><h2>{inventory.scope.connectionId}: discovery evidence</h2>
      <div className="cp-discovery-coverage"><span><UserRound size={18} aria-hidden="true" /> Owner not mapped</span><span><Cable size={18} aria-hidden="true" /> Activity not connected</span><span><ShieldQuestion size={18} aria-hidden="true" /> Action enforcement not verified</span></div>
      {inventory.status === "no-scan" ? <p>No scan has been saved. Cloud resources, roles and actions are unknown.</p> : <>
        <p>{inventory.completeness === "partial" ? "Partial scan: some reads could not be verified." : "API traversal completed within this saved account and region."} Observed {date(inventory.observedAt)}. {inventory.stale ? "This evidence is stale." : "This is a saved observation, not a live authority check."}</p>
        {inventory.historyTruncated && <p>Showing 2,000 resource versions. Full saved history remains in the workspace database.</p>}
        {!inventory.records.length && <p>No runtime observations were saved. This does not prove that agents do not exist elsewhere.</p>}
        {inventory.records.map(({ record, observedInCurrentScan, stale }) => <article className="cp-durable-card" key={`${record.resourceArn}:${record.version}`}><h3><Cloud size={20} aria-hidden="true" /> {record.resourceId}</h3><p>Version {record.version} · Observed {date(record.observedAt)}{stale ? " · Stale" : ""}{!observedInCurrentScan ? " · Retained from an earlier scan" : ""}</p><p>Effective permissions and declared tools are unknown. This agent is not enrolled for controlled execution.</p><details><summary>Identity references</summary><p style={{ overflowWrap: "anywhere" }}>Resource: {record.resourceArn}</p><p style={{ overflowWrap: "anywhere" }}>Role: {record.roleReference || "Not observed"}</p><p style={{ overflowWrap: "anywhere" }}>Workload identity: {record.workloadIdentityReference || "Not observed"}</p></details></article>)}
      </>}
      <p>Discovered identities do not authorize actions. Reviewed owner mapping and cloud enrollment remain required.</p><Link href="/control-plane/agents" prefetch={false}>View existing scoped workspace agents →</Link>
    </section>}
  </div>;
}
