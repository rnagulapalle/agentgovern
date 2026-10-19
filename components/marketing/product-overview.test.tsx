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

  it.each([false, true])("describes the installed quote scope without claiming registration (gated=%s)", gated => {
    const html = renderToStaticMarkup(<ProductOverview gated={gated} quoteOnly />);
    expect(html).toContain("one invited quote workflow");
    expect(html).toContain("independent manager approval");
    expect(html).toContain("No real money moves and no customer email is delivered.");
    expect(html).toContain("Reviewing a plan does not authorize execution.");
    expect(html).toContain("not available in this deployment");
    expect(html).not.toContain("Invited users can register");
    expect(html).toContain(gated ? 'href="/sign-in"' : 'href="/control-plane/quotes"');
  });

  it.each([false, true])("describes the bounded control deployment (gated=%s)", gated => {
    const html = renderToStaticMarkup(<ProductOverview gated={gated} scriptDemo />);
    expect(html).toContain("register sample discount, CRM and messaging agents");
    expect(html).toContain("holds the message until the CRM change is verified");
    expect(html).toContain("separate quote");
    expect(html).toContain("Reviewing a plan does not authorize execution.");
    expect(html).toContain("no customer email is delivered");
    expect(html).toContain("Live customer connectors, refunds and a general workflow builder are not available");
    expect(html).not.toContain("refund workflow uses");
    expect(html).not.toContain("enquiry workspace uses");
  });

  it("discloses sample systems beside the sales invitation", () => {
    const html = renderToStaticMarkup(<ContactSales />);
    expect(html).toContain("CRM and messaging twins");
    expect(html).toContain("Refunds are not available in this deployment.");
    expect(html).not.toContain("simulated payment provider");
    expect(html).toContain("No real money moves or customer email is delivered.");
    expect(html).toContain("bounded pilot if there is a fit");
    expect(html).toContain('href="https://cal.com/rajnagulapalle"');
    expect(html).toContain('href="/sign-in"');
    expect(html).not.toContain("Your booking is confirmed");
  });
});
