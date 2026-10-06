import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { EnquiryWorkspace } from "./enquiry-workspace";
it("labels the actual enquiry scope and exposes no execution or approval before a saved plan", () => {
  const html = renderToStaticMarkup(createElement(EnquiryWorkspace));
  expect(html).toContain("Handle a customer enquiry");
  expect(html).toContain("No real email is delivered");
  expect(html).toContain("Model calls and arbitrary reply generation are not enabled");
  expect(html).toContain("Check and prepare");
  expect(html).not.toContain("Create this reviewed workflow");
  expect(html).not.toContain("Approve exact action");
});
