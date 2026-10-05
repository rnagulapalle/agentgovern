import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MultiFlowScene, multiFlowBranches } from "./multi-flow";

describe("multi-system illustration boundaries", () => {
  it("never sends held or blocked branches and separates dependency from approval", () => {
    for (let step = 0; step < 7; step++) {
      const branches = multiFlowBranches(step);
      expect(branches.find((b) => b.id === "credit")?.dispatch).toBe(false);
      expect(branches.find((b) => b.id === "vendor")?.dispatch).toBe(false);
      expect(branches.find((b) => b.id === "email")?.dispatch).toBe(step === 6);
    }
    expect(multiFlowBranches(5).find((b) => b.id === "email")?.status).toBe(
      "Separate approval required",
    );
  });
  it("uses dense request lanes but no outbound motion for held actions", () => {
    const held = renderToStaticMarkup(
      createElement(MultiFlowScene, { step: 4 }),
    );
    expect(held.match(/class="ll-multi-request-lane"/g)).toHaveLength(21);
    expect(held).not.toContain("ll-multi-outbound-signal");
    const permitted = renderToStaticMarkup(
      createElement(MultiFlowScene, { step: 2 }),
    );
    expect(permitted.match(/ll-multi-outbound-signal/g)).toHaveLength(6);
  });
  it("shows returned evidence and labels the broader pattern as a design illustration", () => {
    const html = renderToStaticMarkup(
      createElement(MultiFlowScene, { step: 4 }),
    );
    expect(html).toContain("DESIGN ILLUSTRATION");
    expect(html).toContain("Inspect a downstream action");
    for (const label of ["CRM ↗", "Messaging ↗", "Billing ↗", "ERP ↗"])
      expect(html).toContain(label);
    expect(html).toContain("Read back effect");
    expect(html).toContain("Outcome uncertain");
    expect(html).toContain("Held · verify CRM first");
    expect(html).toContain("Blocked · above limit");
  });
});
