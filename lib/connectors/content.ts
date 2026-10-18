// Retain this representation for existing prepared-request-1 plans/actions.
// A content change needs a new reviewed request contract, not an edit to v1.
export const acknowledgementV1 = Object.freeze({
  from: "LoopLabs <support@looplabs.example>",
  recipient: "customer@example.test",
  subject: "We received your case",
  text: "Your request was received. A team member will review it.",
  reference: "customer-acknowledgement-v1",
});

import { ControlError } from "../durable/contracts";
export type ReviewedMessageV2 = { version: "reviewed-acknowledgement-2"; subject: string; text: string };
// Narrow recognizable credential shapes only; this is not complete DLP.
export function credentialShapedText(text:string):boolean {
  return /\b(?:sk[-_](?:live|test)|ghp_|AKIA|ASIA[A-Z0-9]{16}\b|password\s*[:=]|api[_ -]?key\s*[:=]|aws[_ -]?(?:access[_ -]?key[_ -]?id|secret[_ -]?access[_ -]?key|session[_ -]?token)\s*[:=]|bearer\s+[a-z0-9._~+/-]{8,}={0,2})|-----BEGIN/i.test(text);
}
// Persist the reviewed message artifact, never raw conversation or credentials.
// Human review, not text classification, decides whether this acknowledgement is suitable.
export function reviewedMessageV2(value: unknown): Readonly<ReviewedMessageV2> {
  const p = value as ReviewedMessageV2;
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).sort().join() !== "subject,text,version" || p.version !== "reviewed-acknowledgement-2"
    || typeof p.subject !== "string" || p.subject.length < 1 || p.subject.length > 120 || p.subject.trim() !== p.subject || /[\u0000-\u001f\u007f]/.test(p.subject)
    || typeof p.text !== "string" || p.text.length < 1 || p.text.length > 800 || p.text.trim() !== p.text || /[\u0000-\u0009\u000b-\u001f\u007f<>]/.test(p.text)
    || credentialShapedText(p.subject + "\n" + p.text))
    throw new ControlError(400, "Use one bounded plain-text acknowledgement without credentials or recipient changes.");
  return Object.freeze({ version: p.version, subject: p.subject, text: p.text });
}
