import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DurableWorkspace } from "./durable-workspace";

describe("action workspace access", () => {
  it("offers workspace access without developer setup or an initial failure", () => {
    const html = renderToStaticMarkup(createElement(DurableWorkspace));
    expect(html).toContain("Action workspace");
    expect(html).toContain("Workspace access key");
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain("Open workspace");
    expect(html).not.toContain('role="alert"');
    for (const setup of ["PostgreSQL", "pnpm", "docs/", "Local setup", "SERVER-BACKED PROOF"])
      expect(html).not.toContain(setup);
  });

  it("keeps connected-data scope visible and links to the refund feature", () => {
    const html = renderToStaticMarkup(createElement(DurableWorkspace));
    expect(html).toContain("Connected sample data");
    expect(html).toContain("sample discount record");
    expect(html).toContain("your customer systems are not connected");
    expect(html).toContain('href="/control-plane/refunds"');
    expect(html).not.toContain("Apply discount");
    expect(html).not.toContain("Approve this discount");
  });
});
