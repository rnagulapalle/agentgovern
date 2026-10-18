"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Snapshot } from '@/lib/durable/contracts';
import { workspaceJson } from '@/lib/workspace/response';
import { PageTitle } from './ui';
import { DiscountHistory } from './discount-history';
export function SavedHistoryWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { const r = await fetch('/api/durable', { cache: 'no-store' }); const data = await workspaceJson(r); if (!r.ok) throw Error(data.error || 'Could not load saved history.'); setSnapshot(data); }
    catch (e) { setSnapshot(null); setError(e instanceof Error ? e.message : 'Could not load saved history.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <div className="cp-durable">
    <PageTitle eyebrow="DECISION HISTORY" title="Saved decision history" description="Review sample discount decisions across sessions. Open each workflow for its own execution history." action={<button className="cp-button" disabled={busy} onClick={() => void refresh()}>Refresh history</button>} />
    {error && <p role="alert" className="cp-durable-message is-error">{error}</p>}
    {busy && <p role="status">Loading saved decisions…</p>}
    {snapshot && <DiscountHistory snapshot={snapshot} />}
  </div>;
}
