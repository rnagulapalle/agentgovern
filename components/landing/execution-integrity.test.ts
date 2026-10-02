import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionIntegrityDashboard } from "./execution-integrity";

describe("readable execution story", () => {
  it("renders the initial phone story as text with its sample-data boundary", () => {
    const html = renderToStaticMarkup(createElement(ExecutionIntegrityDashboard));
    const phone = html.slice(html.indexOf('class="ll-mobile-story"'), html.indexOf("<video"));
    expect(phone).toContain("Illustrative workflow");
    expect(phone).toContain("Supplier onboarding");
    expect(phone).toContain("Vendor Ops agent requests a supplier bank-detail update.");
    expect(phone).toContain("Step 1 of 8");
    expect(phone).toContain("No change made");
    expect(phone).toContain("No connected production systems");
    expect(phone).not.toContain("<img");
    expect(phone).not.toContain("<video");
  });

  it("keeps manual reading controls, pause, transcript, and recovery destination available", () => {
    const html = renderToStaticMarkup(createElement(ExecutionIntegrityDashboard));
    expect(html).toContain('type="button">Previous step</button>');
    expect(html).toContain('type="button">Next step</button>');
    expect(html).toContain('aria-label="Pause execution story"');
    expect(html).toContain("Read the execution story");
    expect(html).toContain('href="/control-plane/reconciliation"');
    expect(html).toContain("does not report activity from connected production systems");
  });
});
