import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { IndustryExamples } from "./industry-examples";
describe("public industry workspace", () => {
  it("offers healthcare and freight with explicit sample scope and no implied native execution", () => { const html = renderToStaticMarkup(<IndustryExamples/>); expect(html).toContain("Healthcare referral coordination"); expect(html).toContain("Freight operations"); expect(html).toContain("Maya Patel"); expect(html).toContain("browser-only"); expect(html).toContain("Business-system calls"); expect(html).toContain("Decision history"); expect(html).not.toContain(["production", "ready"].join("-")); });
  it("keeps private workspace routing and authentication untouched", () => { const legacy = readFileSync("app/agent-governance-demo/layout.tsx", "utf8"); expect(legacy).toContain('redirect("/control-plane")'); const source = readFileSync("components/examples/industry-examples.tsx", "utf8"); expect(source).not.toMatch(/fetch\(|localStorage|sessionStorage/); expect(source).not.toContain("/api/"); });
});
