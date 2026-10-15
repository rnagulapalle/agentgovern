import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DurableAction, Snapshot } from "@/lib/durable/contracts";
import { DiscountApprovalBrief } from "./discount-approval-brief";

const action: DurableAction = {
  id: "request-one", agent_id: "pricing-agent", discount: 25, expected_version: 13,
  policy_version: 2, state: "held", reason: "Named operator approval is required.",
  payload_hash: "digest", lease_token: null, lease_until: null,
  approved_by: null, approval_until: null, created_at: "2026-10-14T00:00:00Z",
};
const snapshot: Snapshot = {
  policy: {version: 2, auto_limit: 15, hard_limit: 50}, record: {version: 13, discount: 5},
  agents: [], actions: [action], events: [], effects: [],
};
const render = (a = action, s = snapshot) => renderToStaticMarkup(createElement(DiscountApprovalBrief, {action: a, snapshot: s}));
describe("discount approval decision brief", () => {
  it("explains the actual limit, exact change, authority boundary and separate execution", () => {
    const html = render();
    for (const text of ["5% → 25%", "25% exceeds the 15%", "50% maximum", "policy version 2", "expected version 13", "pricing-agent", "expires 15 minutes", "Approval does not apply the change", "cannot approve it", "No customer system is connected"])
      expect(html).toContain(text);
    expect(html).not.toContain("request-one");
  });
  it("does not present a new policy as the historical admission rule", () => {
    const html = render(action, {...snapshot, policy: {version: 3, auto_limit: 30, hard_limit: 60}});
    expect(html).toContain("original limits are not available");
    expect(html).not.toContain("30%");
    expect(html).not.toContain("may review it under policy");
  });
  it("does not invent a before value after the source record changes", () => {
    const html = render(action, {...snapshot, record: {version: 14, discount: 40}});
    expect(html).toContain("Do not approve this stale request");
    expect(html).not.toContain("40%");
    expect(html).not.toContain("5% →");
  });
  it("does not misclassify a different held reason as a threshold approval", () => {
    const html = render({...action, discount: 5, reason: "Review evidence is missing."});
    expect(html).toContain("Review evidence is missing");
    expect(html).not.toContain("exceeds the 15%");
  });
  it("does not offer an above-maximum request as reviewable", () => {
    const html = render({...action, discount: 70});
    expect(html).not.toContain("may review it under policy");
    expect(html).toContain("not a guarantee that execution is permitted");
  });
  it("escapes agent and saved reason markup", () => {
    const html = render({...action, discount: 5, agent_id: "<script>secret</script>", reason: "<img src=x>"});
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
  });
});
