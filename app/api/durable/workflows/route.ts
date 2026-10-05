import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { FetchSandboxConnectors } from "@/lib/connectors/twin";
import { WorkflowControl } from "@/lib/workflows/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest) {
  const db = database();
  return {
    actor: await authenticate(db, credential(r)),
    service: new WorkflowControl(
      db,
      new ConnectorControl(db, new FetchSandboxConnectors()),
    ),
  };
}
export async function GET(r: NextRequest) {
  try {
    const { actor, service } = await context(r);
    const id = r.nextUrl.searchParams.get("run");
    return Response.json(
      id ? await service.read(actor, id) : await service.list(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const { actor, service } = await context(r);
    const p = await body(r);
    let result;
    if (
      p.operation === "create" &&
      Object.keys(p).length === 4 &&
      typeof p.crmAgent === "string" &&
      typeof p.emailAgent === "string" &&
      typeof p.runId === "string"
    )
      result = {
        id: await service.create(actor, p.crmAgent, p.emailAgent, p.runId),
      };
    else if (
      Object.keys(p).length === 2 &&
      typeof p.runId === "string" &&
      (p.operation === "pause" || p.operation === "verify")
    )
      result =
        p.operation === "pause"
          ? await service.pause(actor, p.runId)
          : await service.verify(actor, p.runId);
    else throw new ControlError(400, "Choose a supported workflow operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
