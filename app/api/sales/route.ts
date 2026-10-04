import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { body, failure, sameOrigin } from "@/lib/durable/http";
import { submitSales } from "@/lib/workspace/sales";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request, true);
    await submitSales(database(), await body(request));
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
