"use client";
import { useEffect, useState } from "react";
type Status = { available: boolean; owned?: boolean; dispatch?: string | null; canTransfer?: boolean };
export function EnquiryExecution({ id }: { id: string }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [consent, setConsent] = useState(false);
  async function read() {
    const response = await fetch(`/api/workspace/enquiries/execution?run=${id}`, { cache: "no-store" });
    if (!response.ok) throw Error("Execution ownership could not be checked. Refresh before changing this run.");
    setStatus(await response.json()); setError("");
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/workspace/enquiries/execution?run=${id}`, { cache: "no-store" });
        if (!response.ok) throw Error("Execution ownership could not be checked. Refresh before changing this run.");
        const data = await response.json(); if (active) { setStatus(data); setError(""); }
      } catch (e) { if (active) { setStatus(null); setError((e as Error).message); } }
    };
    void load(); const timer = setInterval(load, 7000);
    return () => { active = false; clearInterval(timer); };
  }, [id]);
  if (!error && (!status?.available || (!status.owned && !status.canTransfer))) return null;
  return <section className="cp-durable-scope" aria-label="Saved execution ownership">
    {error && <p role="alert">{error}</p>}
    {status?.available && <><strong>{status.owned ? "Durable execution selected" : "Use durable execution in staging"}</strong>
      {status.owned ? <p>{status.dispatch === "started" ? "The execution engine accepted this saved run." : "This run is saved and waiting for the execution engine to accept it."} Independent action approvals are still required. This scheduling status does not establish worker availability or a verified outcome.</p> : <><p>Move this unexecuted rehearsal to the durable runner. The current runner will no longer dispatch it. This does not approve either action, and the transfer cannot be undone.</p>
        {status.canTransfer && <><label className="cp-enquiry-review"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} /> Use durable execution for this saved rehearsal.</label>
          <button className="cp-button" disabled={busy || !consent} onClick={async () => {
            setBusy(true); setError("");
            try {
              const response = await fetch("/api/workspace/enquiries/execution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "transfer", runId: id }) });
              const data = await response.json(); if (!response.ok) throw Error(data.error || "Transfer could not be confirmed. Refresh before retrying.");
              await read();
            } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}>{busy ? "Saving…" : "Use durable execution"}</button></>}
      </>}
    </>}
  </section>;
}
