import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate, DurableControl } from "@/lib/durable/service";
import { ControlError } from "@/lib/durable/contracts";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const db = database();
    const actor = await authenticate(db, credential(request));
    const service = new DurableControl(db);
    const id = request.nextUrl.searchParams.get("action");
    return Response.json(
      id ? await service.readAction(actor, id) : await service.snapshot(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const db = database();
    const actor = await authenticate(db, credential(request));
    const service = new DurableControl(db);
    const input = await body(request);
    const { operation, ...p } = input;
    let result;
    if (operation === "propose") result = await service.propose(actor, p);
    else if (operation === "configure")
      result = await service.configure(actor, p);
    else {
      if (typeof p.actionId !== "string")
        throw new ControlError(400, "Action ID is required.");
      const allowed =
        operation === "approve" || operation === "reject"
          ? ["actionId", "payloadHash"]
          : operation === "execute"
            ? ["actionId", "lostResponse"]
            : ["actionId"];
      if (Object.keys(p).some((k) => !allowed.includes(k)))
        throw new ControlError(400, "Unexpected action fields.");
      if (operation === "approve" || operation === "reject") {
        if (typeof p.payloadHash !== "string")
          throw new ControlError(400, "Exact payload hash is required.");
        result = await service.review(
          actor,
          p.actionId,
          operation === "approve",
          p.payloadHash,
        );
      } else if (operation === "execute") {
        if (p.lostResponse !== undefined && typeof p.lostResponse !== "boolean")
          throw new ControlError(400, "Invalid failure injection flag.");
        // Failure injection is limited to the controlled proof connector, with no external systems.
        result = await service.execute(
          actor,
          p.actionId,
          p.lostResponse === true,
        );
      } else if (operation === "reconcile")
        result = await service.reconcile(actor, p.actionId);
      else if (operation === "recover")
        result = await service.recover(actor, p.actionId);
      else throw new ControlError(400, "Unknown operation.");
    }
    if (result && "lease_token" in result)
      result = { ...result, lease_token: null };
    return Response.json(result ?? { completed: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
