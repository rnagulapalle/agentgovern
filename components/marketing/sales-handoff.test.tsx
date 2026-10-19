import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SalesRequestSaved } from "./sales-form";
import { parseSalesReceipt, salesCalendarHref, SALES_CALENDAR } from "@/lib/workspace/sales-handoff";

const receipt = { received: true as const, intakeRef: "12345678-1234-4123-8123-123456789abc" };
describe("accepted sales handoff", () => {
  it("carries only the opaque reference to the fixed calendar without claiming a reservation", () => {
    const accepted = parseSalesReceipt(receipt);
    const href = new URL(salesCalendarHref(accepted));
    expect(href.origin + href.pathname).toBe(SALES_CALENDAR);
    expect([...href.searchParams]).toEqual([["metadata[looplabs_intake_ref]", receipt.intakeRef]]);
    const html = renderToStaticMarkup(<SalesRequestSaved receipt={accepted} />);
    expect(html).toContain("We have your request.");
    expect(html).toContain("only when the calendar confirms your selected time");
    expect(html).toContain('rel="noopener noreferrer"');
    for (const phrase of ["demo_booked", "booking is confirmed", "email=", "workflow=", "org=", "company="])
      expect(html).not.toContain(phrase);
  });

  it.each([
    null, [], "saved", {}, { received: true },
    { ...receipt, received: false }, { ...receipt, received: "true" },
    { ...receipt, intakeRef: "person@example.com" },
    { ...receipt, intakeRef: "12345678-1234-1123-8123-123456789abc" },
    { ...receipt, intakeRef: receipt.intakeRef + "&email=person@example.com" },
    { ...receipt, bookingUrl: "https://foreign.example" },
    { ...receipt, email: "person@example.com" },
    { ...receipt, org: "foreign" },
  ])("refuses malformed or expanded receipt %j", value => {
    expect(() => parseSalesReceipt(value)).toThrow("couldn't confirm your saved request");
    expect(() => salesCalendarHref(value as typeof receipt)).toThrow();
  });
});
