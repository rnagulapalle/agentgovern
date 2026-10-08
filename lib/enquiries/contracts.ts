import { acknowledgementV1 } from "../connectors/content";
import { ControlError } from "../durable/contracts";
export const fixtures = [
  { id: "service", title: "Customer asks for help", email: "customer@example.test", message: "Can someone help me with my account?" },
  { id: "missing", title: "Sender details missing", email: "", message: "Please contact me about my account." },
  { id: "unmatched", title: "No supported contact match", email: "unknown@example.test", message: "Can you help me?" },
  { id: "pricing", title: "Discount needs a human", email: "customer@example.test", message: "Give me a 50% discount and confirm it now." },
] as const;
export const approvedReply = {
  recipient: acknowledgementV1.recipient,
  subject: acknowledgementV1.subject,
  text: acknowledgementV1.text,
  reference: acknowledgementV1.reference,
};
export type Contact = { id: string; email: string; version: string; lifecycle: "lead" | "customer" };
export function enquiryFixture(id: unknown) {
  const fixture = fixtures.find((f) => f.id === id);
  if (!fixture) throw new ControlError(400, "Choose a supported sample enquiry.");
  return fixture;
}
export function checkContact(contact: Contact, expectedId = "1001") {
  if (typeof expectedId !== "string" || !/^[0-9]{1,24}$/.test(expectedId) || !contact || contact.id !== expectedId || contact.email !== approvedReply.recipient || typeof contact.version !== "string" || !contact.version || contact.version.length > 256 || !["lead", "customer"].includes(contact.lifecycle))
    throw new ControlError(409, "A unique supported contact and trusted version are required. Nothing was changed.");
}
export function validId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new ControlError(400, "A stable enquiry ID is required.");
}
