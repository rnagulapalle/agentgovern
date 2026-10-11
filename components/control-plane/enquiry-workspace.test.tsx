import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { EnquiryWorkspace } from "./enquiry-workspace";
it("labels the actual enquiry scope and exposes no execution or approval before a saved plan", () => {
  const html = renderToStaticMarkup(createElement(EnquiryWorkspace));
  expect(html).toContain("Describe the work.");
  expect(html).toContain("No real email is delivered");
  expect(html).toContain("Chat interprets your request using a model");
  expect(html).toContain("Send request");
  expect(html).toContain("Workflow conversation");
  expect(html).toContain("WORKFLOW PLANS");
  expect(html).toContain("Validation environment");
  expect(html).toContain("Saved work");
  expect(html).not.toMatch(/rehears(?:e|al)/i);
  expect(html).not.toContain("Create this reviewed workflow");
  expect(html).not.toContain("Approve exact action");
});

it("keeps the conversation and saved artifact distinct without enabling unsaved effects", () => {
  const html = renderToStaticMarkup(createElement(EnquiryWorkspace));
  expect(html).toContain('aria-label="Saved plan and progress"');
  expect(html).toContain("Your plan appears here");
  expect(html).toContain("Preparing or reviewing a plan never approves execution");
  expect(html).toContain("Conversation text is not stored");
  expect(html).toContain("Sample systems · no real delivery");
  expect(html).not.toContain("Submit for approval");
  expect(html).not.toContain("Approve acknowledgement");
  expect(html).not.toContain('<pre');
  // A missing connector response is loading, not an assertion of hosted readiness.
  expect(html).toContain("Checking connection…");
  expect(html).not.toContain("Hosted CRM · version guarantee missing");
});

import { chatSubmission } from "./enquiry-workspace";
it("shows submitted work before a deferred response and refuses concurrent sends", async () => {
  const submit = chatSubmission(), events: string[] = [];
  let release!: (result: string) => void;
  const waiting = new Promise<string>(resolve => { release = resolve; });
  const first = submit("stable-id/exact-turns", retry => events.push(retry ? "retry" : "pending"), () => { events.push("request"); return waiting; }, result => events.push(result), () => events.push("uncertain"));
  expect(events).toEqual(["pending", "request"]);
  expect(await submit("stable-id/exact-turns", () => events.push("duplicate"), async () => "duplicate", () => {}, () => {})).toBe(false);
  release("clarification"); expect(await first).toBe(true);
  expect(events).toEqual(["pending", "request", "clarification"]);
});
it("contains an unconfirmed response without retry and accepts only an exact manual retry", async () => {
  const submit = chatSubmission(), events: string[] = []; let calls = 0;
  await expect(submit("same-id/same-turns", retry => events.push(String(retry)), async () => { calls++; throw Error("Lost response"); }, () => {}, () => events.push("uncertain"))).rejects.toThrow("Lost response");
  expect(calls).toBe(1); expect(events).toEqual(["false", "uncertain"]);
  await expect(submit("same-id/changed-turns", () => {}, async () => { calls++; return "unsafe"; }, () => {}, () => {})).rejects.toThrow("previous request is unconfirmed");
  expect(calls).toBe(1);
  expect(await submit("same-id/same-turns", retry => events.push(String(retry)), async () => { calls++; return "saved plan"; }, result => events.push(result), () => {})).toBe(true);
  expect(calls).toBe(2); expect(events).toEqual(["false", "uncertain", "true", "saved plan"]);
  expect(await submit("same-id/next-clarification", retry => events.push(String(retry)), async () => "clarified plan", result => events.push(result), () => {})).toBe(true);
  expect(events.slice(-2)).toEqual(["false", "clarified plan"]);
});
