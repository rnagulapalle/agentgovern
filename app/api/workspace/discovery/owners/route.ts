import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { CloudOwnerReviewStore } from "@/lib/workspace/cloud-owner-review";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const db = database(), actor = await authenticate(db, credential(request));
    const store = new CloudOwnerReviewStore(db), params = request.nextUrl.searchParams;
    if (![...params.keys()].length) return Response.json(await store.owners(actor), { headers });
    const keys = ["connectionId", "provider", "resource", "scanId", "version"];
    if ([...params.keys()].sort().join() !== keys.join() || keys.some(k => params.getAll(k).length !== 1)) throw new ControlError(400, "Choose one exact saved cloud observation.");
    const reference = Object.fromEntries(params);
    return Response.json(await store.status(actor, { ...reference, version: reference.provider === "google-agent-engine" && reference.version === "" ? null : reference.version, id: randomUUID(), owner: actor.subject }), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const db = database(), actor = await authenticate(db, credential(request));
    return Response.json(await new CloudOwnerReviewStore(db).review(actor, await body(request)), { headers });
  } catch (error) { return failure(error); }
}
