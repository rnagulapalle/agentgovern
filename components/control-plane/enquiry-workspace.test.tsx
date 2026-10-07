import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { EnquiryWorkspace } from "./enquiry-workspace";
it("labels the actual enquiry scope and exposes no execution or approval before a saved plan", () => {
  const html = renderToStaticMarkup(createElement(EnquiryWorkspace));
  expect(html).toContain("Describe the work. Rehearse it first.");
  expect(html).toContain("No real email is delivered");
  expect(html).toContain("Chat interprets your request using a model");
  expect(html).toContain("Send request");
  expect(html).toContain("Workflow conversation");
  expect(html).not.toContain("Create this reviewed workflow");
  expect(html).not.toContain("Approve exact action");
});
