import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ControlError } from "../durable/contracts";
import { throttle } from "./auth";
import { COMPANY_SIZES } from "./sales-options";
export function parseSales(input: Record<string, unknown>) {
  const fields = [
    "email",
    "name",
    "company",
    "companySize",
    "role",
    "workflow",
    "website",
  ];
  if (
    Object.keys(input).some((k) => !fields.includes(k)) ||
    fields.some((k) => typeof input[k] !== "string")
  )
    throw new ControlError(400, "Complete the required fields.");
  const values = Object.fromEntries(
    fields.map((k) => [k, (input[k] as string).trim()]),
  );
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ||
    values.email.length > 254 ||
    values.name.length < 2 ||
    values.name.length > 120 ||
    values.company.length < 2 ||
    values.company.length > 160 ||
    !COMPANY_SIZES.includes(values.companySize) ||
    !values.role ||
    values.role.length > 120 ||
    values.workflow.length < 10 ||
    values.workflow.length > 2000 ||
    values.website
  )
    throw new ControlError(
      400,
      "Enter your contact details and the workflow you want to discuss.",
    );
  return values;
}
export async function submitSales(db: Pool, input: Record<string, unknown>) {
  const v = parseSales(input);
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    if (!(await throttle(c, "sales-global", 10, 300))) {
      await c.query("COMMIT");
      throw new ControlError(
        429,
        "Please try again shortly or use the booking link.",
      );
    }
    await c.query(
      "INSERT INTO ll_sales_requests(id,email,name,company,company_size,role,workflow) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        v.email.toLowerCase(),
        v.name,
        v.company,
        v.companySize,
        v.role,
        v.workflow,
      ],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
