import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { agentDirectory, registerAgent } from "@/lib/workspace/agents";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const db = database();
    return Response.json(
      await agentDirectory(db, await authenticate(db, credential(request))),
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
    return Response.json(
      await registerAgent(
        db,
        await authenticate(db, credential(request)),
        await body(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
