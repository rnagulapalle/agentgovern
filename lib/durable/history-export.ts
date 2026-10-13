import type { Snapshot } from './contracts';
/** A bounded, explicit projection. Never export runtime credentials or lease fields. */
export function discountHistoryExport(snapshot: Snapshot) {
  const actions = snapshot.actions.slice(0, 100).map(a => ({
    id: a.id, agentId: a.agent_id, discount: a.discount,
    sourceVersion: a.expected_version, policyVersion: a.policy_version,
    state: a.state, reason: a.reason, approvedBy: a.approved_by,
    approvalExpiresAt: a.approval_until, createdAt: a.created_at,
  }));
  const ids = new Set(actions.map(a => a.id));
  const events = snapshot.events.slice(0, 200).map(e => ({
    id: e.id, actionId: e.action_id, kind: e.kind, actor: e.subject, at: e.at,
  }));
  const effects = snapshot.effects.filter(e => ids.has(e.action_id)).map(e => ({
    actionId: e.action_id, beforeDiscount: e.before_discount, afterDiscount: e.after_discount,
    recordVersion: e.after_version, recovered: e.recovered,
  }));
  return {
    format: 'looplabs-discount-history-1',
    scope: 'Sample discount actions and workspace decisions only. Excludes quote, CRM and email history.',
    limits: { actions: 100, events: 200, effects: 'Only effects for included actions' },
    counts: { actions: actions.length, events: events.length, effects: effects.length },
    windowAtLimit: { actions: actions.length === 100, events: events.length === 200 },
    completeness: 'Recent bounded snapshot, not a complete archive. Earlier history may exist on the server. Events can reference actions outside this window.',
    assurance: 'Server records protected from application update/delete; not cryptographically signed or an independent audit certificate.',
    actions, events, effects,
  };
}
