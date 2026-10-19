import { NextRequest } from "next/server";
import { tenantContext } from "../../../lib/workspace/tenant-context";
import { body, failure, sameOrigin } from "../../../lib/durable/http";
import { submitSales } from "../../../lib/workspace/sales";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request, true);
    const receipt = await submitSales(
      await tenantContext().sales(),
      await body(request),
    );
    return Response.json(
      receipt,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
