"use client";
import { useState } from 'react';
import type { Snapshot } from '@/lib/durable/contracts';
import { discountHistoryExport } from '@/lib/durable/history-export';
import { PanelHead } from './ui';
export function DiscountHistory({ snapshot }: { snapshot: Snapshot }) {
  const [expanded, setExpanded] = useState(false);
  const report = discountHistoryExport(snapshot);
  return <section className="cp-panel cp-durable-card">
    <PanelHead title="Saved decision history" sub="Named decisions and verified changes, saved on the server."
      action={<button className="cp-button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'looplabs-discount-history.json'; link.click(); URL.revokeObjectURL(url);
      }}>Export history</button>} />
    <p>{report.counts.actions} recent actions · {report.counts.events} recent events · {report.counts.effects} recorded effects for these actions.</p>
    <ol className="cp-durable-events">{report.events.slice(0, expanded ? 200 : 10).map(e => <li key={e.id}>
      <strong>{e.kind.replaceAll('_', ' ')}</strong>
      <span>{e.actor} · {new Date(e.at).toLocaleString()}</span>
      <span className="cp-durable-id">{e.actionId || 'Workspace control'}</span>
    </li>)}</ol>
    {report.events.length === 0 && <p>No saved discount decisions yet.</p>}
    {report.events.length > 10 && <button className="cp-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show latest 10 decisions' : `Show ${report.events.length} recent decisions`}</button>}
    <p className="cp-durable-help">This view and export contain up to 100 recent discount actions and 200 events. Earlier history may exist on the server. Quote, CRM and email history is separate.</p>
    <p className="cp-durable-help">The application cannot edit or delete these events. This export is not cryptographically signed or an independent audit certificate.</p>
  </section>;
}
