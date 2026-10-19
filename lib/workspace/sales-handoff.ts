// Safe in the browser. A reference is correlation data, never authentication or
// proof of a reservation. The destination is fixed; no request field selects it.
export const SALES_CALENDAR = "https://cal.com/rajnagulapalle";
const intakeReference = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type SalesReceipt = Readonly<{ received: true; intakeRef: string }>;

export function parseSalesReceipt(value: unknown): SalesReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("We couldn't confirm your saved request. Please contact the founders before submitting again.");
  const receipt = value as Record<string, unknown>;
  if (receipt.received !== true || typeof receipt.intakeRef !== "string" ||
      !intakeReference.test(receipt.intakeRef) ||
      Object.keys(receipt).sort().join() !== "intakeRef,received")
    throw new Error("We couldn't confirm your saved request. Please contact the founders before submitting again.");
  return { received: true, intakeRef: receipt.intakeRef };
}

export function salesCalendarHref(receipt: SalesReceipt): string {
  const accepted = parseSalesReceipt(receipt);
  const url = new URL(SALES_CALENDAR);
  url.searchParams.set("metadata[looplabs_intake_ref]", accepted.intakeRef);
  return url.href;
}
