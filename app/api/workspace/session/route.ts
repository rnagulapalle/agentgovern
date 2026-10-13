import { NextRequest, NextResponse } from "next/server";
import { tenantContext } from "../../../../lib/workspace/tenant-context";
import {
  body,
  browserOrigin,
  failure,
  sameOrigin,
  SESSION_COOKIE,
} from "../../../../lib/durable/http";


import {
  WORKSPACE_COOKIE,
} from "../../../../lib/workspace/identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request, true);
    const token = await tenantContext().login(await body(request));
    const response = NextResponse.json({ signedIn: true });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(WORKSPACE_COOKIE, token, {
      httpOnly: true,
      secure: new URL(browserOrigin(request)).protocol === "https:",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: NextRequest) {
  try {
    const {db,actor} = await tenantContext().member(request.cookies.get(WORKSPACE_COOKIE)?.value || "");
    const { rows } = await db.query(
      "SELECT name,email FROM ll_members WHERE email=$1 AND org_id=$2",
      [actor.subject, actor.orgId],
    );
    return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    sameOrigin(request, true);
    const token = request.cookies.get(WORKSPACE_COOKIE)?.value;
    if (token) await tenantContext().logout(token);
    const response = NextResponse.json({ signedOut: true });
    response.cookies.set(WORKSPACE_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/api/durable",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (e) {
    return failure(e);
  }
}
