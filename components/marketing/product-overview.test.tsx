import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductOverview } from "./product-overview";
import ContactSales from "@/app/contact-sales/page";

describe("product evaluation scope", () => {
  it.each([false, true])("keeps planning separate from authority (gated=%s)", (gated) => {
    const html = renderToStaticMarkup(<ProductOverview gated={gated} />);
    expect(html).toContain("Where enabled,");
    expect(html).toContain("bounded planner");
    expect(html).toContain("independent review");
    expect(html).toContain("Reviewing a plan does not authorize execution.");
    expect(html).toContain("no customer email is delivered");
    expect(html).toContain("real money moves");
    expect(html).toContain("general workflow builder are not available yet");
    expect(html).not.toContain("connectors, model execution");
    expect(html).toContain('href="/contact-sales"');
    if (gated) {
      expect(html).toContain("available to invited teams");
      expect(html).toContain('href="/sign-in"');
    }
  });

  it("discloses sample systems beside the sales invitation", () => {
    const html = renderToStaticMarkup(<ContactSales />);
    expect(html).toContain("CRM and messaging twins");
    expect(html).toContain("No real money moves or customer email is delivered.");
    expect(html).toContain("bounded pilot if there is a fit");
    expect(html).toContain('href="https://cal.com/rajnagulapalle"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain("Your booking is confirmed");
  });
});
