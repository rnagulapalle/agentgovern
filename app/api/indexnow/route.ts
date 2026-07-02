import { NextResponse } from "next/server";
import { submitToIndexNow } from "@/lib/indexnow";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const urls: unknown = body?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ success: false, error: "urls array required" }, { status: 400 });
    }
    const urlList = urls.filter((u): u is string => typeof u === "string");
    const result = await submitToIndexNow(urlList);
    return NextResponse.json({ success: result.ok, ...result }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "IndexNow failed" },
      { status: 502 },
    );
  }
}
