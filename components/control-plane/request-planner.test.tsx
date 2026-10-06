import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { WorkflowWorkspace } from "./workflow-workspace";

it("starts guided work without exposing creation before review and discloses its actual scope", () => {
  const html = renderToStaticMarkup(createElement(WorkflowWorkspace, { guided: true }));
  expect(html).toContain("What would you like done?");
  expect(html).toContain("no AI model runs");
  expect(html).toContain("not sent to a model or saved with the run");
  expect(html).toContain("Review a plan");
  expect(html).toContain('maxLength="600"');
  expect(html).not.toContain("Create reviewed workflow");
  expect(html).not.toContain("Choose an agent");
  expect(html).not.toContain("Execute");
});

it("preserves the existing direct saved-workflow entry", () => {
  const html = renderToStaticMarkup(createElement(WorkflowWorkspace));
  expect(html).toContain("Start workflow");
  expect(html).not.toContain("What would you like done?");
  expect(html).toContain("no real CRM, email or model is connected");
});
