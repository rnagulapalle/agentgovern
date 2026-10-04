import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { ControlError } from "@/lib/durable/contracts";
import { body, browserOrigin, failure, sameOrigin, SESSION_COOKIE } from "@/lib/durable/http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request, true);
    const value = await body(request);
    if (typeof value.token !== "string" || Object.keys(value).length !== 1)
      throw new ControlError(400, "Provide an operator access token.");
    const actor = await authenticate(database(), value.token);
    if (actor.role !== "operator")
      throw new ControlError(403, "Only an operator can open this workspace.");
    const response = NextResponse.json({ subject: actor.subject });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(SESSION_COOKIE, value.token, {
      httpOnly: true,
      secure: new URL(browserOrigin(request)).protocol === "https:",
      sameSite: "strict",
      path: "/api/durable",
      maxAge: 3600,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request, true);
    const response = NextResponse.json({ signedOut: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/api/durable",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
