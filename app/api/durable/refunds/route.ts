import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { RefundControl } from "@/lib/refunds/service";
import { FetchSandboxStripe } from "@/lib/refunds/twin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const db = database();
    const actor = await authenticate(db, credential(request));
    const service = new RefundControl(db, new FetchSandboxStripe());
    const id = request.nextUrl.searchParams.get("action");
    return Response.json(
      id ? await service.read(actor, id) : await service.snapshot(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const db = database();
    const actor = await authenticate(db, credential(request));
    const service = new RefundControl(db, new FetchSandboxStripe());
    const { operation, ...p } = await body(request);
    let result;
    if (operation === "propose") result = await service.propose(actor, p);
    else if (operation === "configure")
      result = await service.configure(actor, p);
    else {
      if (typeof p.actionId !== "string")
        throw new ControlError(400, "Action ID required.");
      const fields =
        operation === "approve" || operation === "reject"
          ? ["actionId", "payloadHash"]
          : operation === "execute"
            ? ["actionId", "lostResponse"]
            : ["actionId"];
      if (Object.keys(p).some((k) => !fields.includes(k)))
        throw new ControlError(400, "Unexpected refund fields.");
      if (operation === "approve" || operation === "reject") {
        if (typeof p.payloadHash !== "string")
          throw new ControlError(400, "Exact payload hash required.");
        result = await service.review(
          actor,
          p.actionId,
          p.payloadHash,
          operation === "approve",
        );
      } else if (operation === "execute") {
        if (p.lostResponse !== undefined && typeof p.lostResponse !== "boolean")
          throw new ControlError(400, "Invalid test flag.");
        result = await service.execute(
          actor,
          p.actionId,
          p.lostResponse === true,
        );
      } else if (operation === "reconcile")
        result = await service.reconcile(actor, p.actionId);
      else throw new ControlError(400, "Unknown refund operation.");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
