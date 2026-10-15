import type { DurableAction, Snapshot } from "@/lib/durable/contracts";

/** Explain only evidence in the saved action and its matching current snapshot. */
export function DiscountApprovalBrief({ action, snapshot }: {
  action: DurableAction; snapshot: Snapshot;
}) {
  const policy = snapshot.policy;
  const policyMatches = policy?.version === action.policy_version;
  const recordMatches = snapshot.record?.version === action.expected_version;
  const heldByLimit = policyMatches && action.discount > policy.auto_limit && action.discount <= policy.hard_limit;
  return (
    <section aria-label="Approval decision brief">
      <h4>What you are being asked to approve</h4>
      <p>Set the sample discount record to <strong>{action.discount}%</strong> using agent <strong>{action.agent_id}</strong>.</p>
      <dl>
        <div><dt>Record being changed</dt><dd>Sample discount record · expected version {action.expected_version}</dd></div>
        <div><dt>Current discount</dt><dd>{recordMatches ? `${snapshot.record.discount}% → ${action.discount}%` : "The record has changed. Its previous discount is not available in this request."}</dd></div>
        <div><dt>Why it needs approval</dt><dd>{heldByLimit
          ? `${action.discount}% exceeds the ${policy.auto_limit}% automatic approval limit. It is within the ${policy.hard_limit}% maximum, so an independent member may review it under policy version ${action.policy_version}.`
          : policyMatches
            ? `The saved request is held: ${action.reason} Review is not a guarantee that execution is permitted.`
            : `Policy version ${action.policy_version} no longer matches the current policy. The original limits are not available here; prepare a new request.`}</dd></div>
      </dl>
      {!recordMatches && <p>Do not approve this stale request. Prepare a new request against the current record.</p>}
      <h4>What approval permits</h4>
      <p>Approval covers only this exact discount, agent, source record version and policy version. It expires 15 minutes after approval. Execution checks the authorization and record again.</p>
      <p>Approval does not apply the change. A separate execution step changes the sample record. No customer system is connected.</p>
      <p>The member who submitted this request cannot approve it. Another named member must make the decision.</p>
    </section>
  );
}
