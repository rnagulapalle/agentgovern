import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { RefundControl } from "@/lib/refunds/service";
import { FetchSandboxStripe } from "@/lib/refunds/twin";
import { BackOffice } from "@/lib/back-office/service";
import { FetchSandboxBackOffice } from "@/lib/back-office/provider";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest) {
  const db = database();
  const actor = await authenticate(db, credential(r));
  return {
    actor,
    service: new BackOffice(
      db,
      new RefundControl(db, new FetchSandboxStripe()),
      new FetchSandboxBackOffice(),
    ),
  };
}
export async function GET(r: NextRequest) {
  try {
    const { actor, service } = await context(r);
    return Response.json(await service.list(actor), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const { actor, service } = await context(r),
      p = await body(r);
    let result;
    if (
      p.operation === "draft" &&
      Object.keys(p).length === 3 &&
      typeof p.id === "string"
    )
      result = await service.draft(actor, p.id, p.prompt);
    else if (
      ["publish", "approve"].includes(String(p.operation)) &&
      Object.keys(p).length === 3 &&
      typeof p.id === "string" &&
      typeof p.hash === "string"
    )
      result =
        p.operation === "publish"
          ? await service.publish(actor, p.id, p.hash)
          : await service.approve(actor, p.id, p.hash);
    else if (
      p.operation === "create" &&
      Object.keys(p).length === 4 &&
      typeof p.id === "string" &&
      typeof p.planId === "string" &&
      typeof p.amount === "number"
    )
      result = await service.create(actor, p.id, p.planId, p.amount);
    else if (
      p.operation === "advance" &&
      Object.keys(p).length === 3 &&
      typeof p.id === "string" &&
      typeof p.loseResponse === "boolean"
    )
      result = await service.advance(actor, p.id, p.loseResponse);
    else if (
      p.operation === "inspect" &&
      Object.keys(p).length === 2 &&
      typeof p.id === "string"
    )
      result = await service.inspect(actor, p.id);
    else
      throw new ControlError(400, "Choose a supported back-office operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
