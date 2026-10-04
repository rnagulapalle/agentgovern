export function agentPresentation(tools: string[]) {
  if (tools.includes("stripe.refund"))
    return {
      role: "Refund agent",
      action: "Refund the prepared payment",
      workflow: "refunds",
    };
  if (tools.includes("twin.crm"))
    return {
      role: "CRM agent",
      action: "Update the simulated contact lifecycle",
      workflow: "crm",
    };
  if (tools.includes("twin.email"))
    return {
      role: "Messaging agent",
      action: "Send the prepared sample message",
      workflow: "email",
    };
  if (tools.includes("proof.discount"))
    return {
      role: "Discount agent",
      action: "Update the sample discount",
      workflow: "discounts",
    };
  return {
    role: "No supported role",
    action: "No supported action assigned",
    workflow: null,
  };
}
