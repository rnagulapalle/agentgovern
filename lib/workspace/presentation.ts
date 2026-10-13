export function agentPresentation(tools: string[]) {
  if (tools.includes("twin.quote"))
    return { role: "Quote agent", action: "Update the enrolled sample quote", workflow: "quotes" };
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

/** A navigation hint only; the destination retains its own server authorization. */
export function agentReviewDestination(tools: string[], scriptDemo = false): string | null {
  const workflow = agentPresentation(tools).workflow;
  if (workflow === 'quotes') return '/control-plane/quotes';
  if (scriptDemo && (workflow === 'refunds' || workflow === null)) return null;
  return workflow ? `/control-plane/actions?workflow=${workflow}` : '/control-plane/connectors';
}
