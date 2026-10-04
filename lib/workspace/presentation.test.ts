import { it, expect } from "vitest";
import { agentPresentation } from "./presentation";
it("shows the supported capability and routes it to the matching workflow", () => {
  for (const [tool, role, workflow] of [
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
