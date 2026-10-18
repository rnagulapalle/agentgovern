import { it, expect } from "vitest";
import { agentPresentation, agentReviewDestination } from "./presentation";
it("shows the supported capability and routes it to the matching workflow", () => {
  for (const [tool, role, workflow] of [
    ["twin.quote", "Quote agent", "quotes"],
    ["proof.discount", "Discount agent", "discounts"],
    ["stripe.refund", "Refund agent", "refunds"],
    ["twin.crm", "CRM agent", "crm"],
    ["twin.email", "Messaging agent", "email"],
  ])
    expect(agentPresentation([tool])).toMatchObject({ role, workflow });
  expect(agentPresentation(["arbitrary.admin"])).toEqual({
    role: "No supported role",
    action: "No supported action assigned",
    workflow: null,
  });
});

it('routes installed agent cards only to enabled capabilities and marks unsupported roles unavailable', () => {
  for (const [tool, destination] of [
    ['twin.quote', '/control-plane/quotes'],
    ['proof.discount', '/control-plane/actions?workflow=discounts'],
    ['twin.crm', '/control-plane/actions?workflow=crm'],
    ['twin.email', '/control-plane/actions?workflow=email'],
  ]) expect(agentReviewDestination([tool], true)).toBe(destination);
  for (const tools of [[], ['stripe.refund'], ['arbitrary.admin']]) expect(agentReviewDestination(tools, true)).toBeNull();
  expect(agentReviewDestination(['stripe.refund'])).toBe('/control-plane/actions?workflow=refunds');
  expect(agentReviewDestination([])).toBe('/control-plane/connectors');
});
