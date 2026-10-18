import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { tenantContext } from "../../../../../lib/workspace/tenant-context";
import { body, credential, failure, sameOrigin } from "../../../../../lib/durable/http";
import { ControlError } from "../../../../../lib/durable/contracts";
import { CloudOwnerReviewStore } from "../../../../../lib/workspace/cloud-owner-review";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const awsOnly = () => process.env.LOOPLABS_DEPLOYMENT_PROFILE === "isolated-control-demo-1";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await tenantContext().authenticated(credential(request));
    const store = new CloudOwnerReviewStore(db), params = request.nextUrl.searchParams;
    if (![...params.keys()].length) return Response.json(await store.owners(actor), { headers });
    const keys = ["connectionId", "provider", "resource", "scanId", "version"];
    if ([...params.keys()].sort().join() !== keys.join() || keys.some(k => params.getAll(k).length !== 1)) throw new ControlError(400, "Choose one exact saved cloud observation.");
    const reference = Object.fromEntries(params);
    if (awsOnly() && reference.provider !== "aws-agentcore-runtime") throw new ControlError(403, "Only AWS owner review is enabled in this installation.");
    return Response.json(await store.status(actor, { ...reference, version: reference.provider === "google-agent-engine" && reference.version === "" ? null : reference.version, id: randomUUID(), owner: actor.subject }), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, actor } = await tenantContext().authenticated(credential(request));
    const input = await body(request);
    if (awsOnly() && input.provider !== "aws-agentcore-runtime") throw new ControlError(403, "Only AWS owner review is enabled in this installation.");
    return Response.json(await new CloudOwnerReviewStore(db).review(actor, input), { headers });
  } catch (error) { return failure(error); }
}
