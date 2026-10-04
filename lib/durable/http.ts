import type { NextRequest } from "next/server";
import { WORKSPACE_COOKIE } from "../workspace/identity";
import { ControlError } from "./contracts";
export const SESSION_COOKIE = "looplabs_durable_session";
export function credential(request: NextRequest) {
  const bearer = request.headers.get("authorization");
  return bearer?.startsWith("Bearer ")
    ? bearer.slice(7)
    : request.cookies.get(WORKSPACE_COOKIE)?.value ||
        request.cookies.get(SESSION_COOKIE)?.value ||
        "";
}
export function browserOrigin(request: NextRequest) {
  const configured = process.env.LOOPLABS_DURABLE_ORIGIN;
  if (!configured) return new URL(request.url).origin;
  // Server-owned origin, never inferred from caller-controlled proxy headers.
  if (!["https://looplabs.run", "https://agentgovern.ai"].includes(configured))
    throw new ControlError(
      503,
      "Durable browser origin is not configured correctly.",
    );
  return configured;
}
export function sameOrigin(request: NextRequest, requireOrigin = false) {
  const origin = request.headers.get("origin");
  const bearer = request.headers.get("authorization")?.startsWith("Bearer ");
  if (
    (origin && origin !== browserOrigin(request)) ||
    (!origin && (requireOrigin || !bearer))
  )
    throw new ControlError(
      403,
      "Same-origin requests are required for browser operations.",
    );
}
export async function body(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ControlError(415, "Send application/json.");
  // Bound streaming bodies too; Content-Length is not trustworthy.
  const reader = request.body?.getReader();
  if (!reader) throw new ControlError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new ControlError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ControlError(400, "Invalid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ControlError(400, "Provide an object.");
  return value as Record<string, unknown>;
}
export function failure(error: unknown) {
  if (error instanceof ControlError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  // Connection errors and SQL detail must never expose credentials or stored data.
  return Response.json(
    {
      error:
        "The durable service could not complete this request. State was not assumed successful; refresh and inspect the action.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
