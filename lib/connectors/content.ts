// Retain this representation for existing prepared-request-1 plans/actions.
// A content change needs a new reviewed request contract, not an edit to v1.
export const acknowledgementV1 = Object.freeze({
  from: "LoopLabs <support@looplabs.example>",
  recipient: "customer@example.test",
  subject: "We received your case",
  text: "Your request was received. A team member will review it.",
  reference: "customer-acknowledgement-v1",
});
