"use client";
import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { workspaceJson } from "@/lib/workspace/response";
import type { CloudOwnerReview, CloudOwnerReviewStore } from "@/lib/workspace/cloud-owner-review";
type Reference = Omit<CloudOwnerReview, "id" | "owner">;
type Status = Awaited<ReturnType<CloudOwnerReviewStore["status"]>>;
type Owners = Awaited<ReturnType<CloudOwnerReviewStore["owners"]>>;
export function CloudOwnerReviewCard({ reference, current }: { reference: Reference; current: boolean }) {
  const query = new URLSearchParams({ ...reference, version: reference.version ?? "" }).toString();
  const [status, setStatus] = useState<Status | null>(null), [owners, setOwners] = useState<Owners | null>(null);
  const [owner, setOwner] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const live = useRef(""); live.current = expanded ? query : "";
  const pending = useRef<{ key:string; owner:string; id:string } | null>(null);
  useEffect(() => {
    let active = true; setStatus(null); setOwners(null); setOwner(""); setError(""); setBusy(false);
    if (!expanded) return;
    Promise.all([fetch(`/api/workspace/discovery/owners?${query}`, { cache:"no-store" }), fetch("/api/workspace/discovery/owners", { cache:"no-store" })]).then(async responses => {
      const values = await Promise.all(responses.map(workspaceJson));
      for (let i=0;i<responses.length;i++) if (!responses[i].ok) throw Error(values[i].error);
      if (active) { setStatus(values[0]); setOwners(values[1]); setOwner(values[1].owners.some((person:{email:string})=>person.email===values[0].owner) ? values[0].owner : ""); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Owner review could not be loaded."); });
    return () => { active=false; if(live.current===query) live.current=""; };
  }, [query, expanded]);
  async function review() {
    if (!owner || busy || !current) return;
    setBusy(true); setError("");
    if (!pending.current || pending.current.key!==query || pending.current.owner!==owner) pending.current={key:query,owner,id:crypto.randomUUID()};
    try {
      const response=await fetch("/api/workspace/discovery/owners", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...reference,owner,id:pending.current.id})});
      const value=await workspaceJson(response); if(!response.ok) throw Error(value.error);
      const refreshed=await fetch(`/api/workspace/discovery/owners?${query}`,{cache:"no-store"}), saved=await workspaceJson(refreshed); if(!refreshed.ok) throw Error(saved.error);
      if (live.current===query) setStatus(saved);
    } catch(e) { if (live.current===query) setError(e instanceof Error ? e.message : "Owner review could not be saved. Retry this same decision."); }
    finally { if (live.current===query) setBusy(false); }
  }
  return <details className="cp-durable-card" onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Review accountable owner</summary><h4><UserRound size={18} aria-hidden="true" /> Accountable owner</h4>
    {error && <p role="alert" className="cp-durable-message is-error">{error}</p>}
    {!status && !error && <p role="status">Loading owner review…</p>}
    {status && <p role="status">{status.ownership==="reviewed" ? `Owner reviewed: ${status.owner}` : status.ownership==="needs-review" ? `Owner review needs renewal${status.owner ? `: ${status.owner}` : ""}.` : "No accountable owner has been reviewed."}</p>}
    <p>Owner review records responsibility for this observation. It does not enroll the agent, verify its workload identity or authorize actions.</p>
    {!current && <p>Refresh the cloud inventory before reviewing ownership for this resource.</p>}
    {owners && status && current && <form className="cp-durable-form" onSubmit={e=>{e.preventDefault();void review();}}>
      <label>Invited owner<select aria-label="Invited owner" value={owner} onChange={e=>setOwner(e.target.value)} required disabled={busy}><option value="">Choose an invited owner</option>{owners.owners.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}</select></label>
      <button className="cp-button" disabled={busy || !owner}>{busy ? "Saving owner review…" : "Save owner review"}</button>
    </form>}
    {owners?.truncated && <p>Showing the first 100 active invited owners. Ask your administrator if the intended owner is missing.</p>}
  </details>;
}
