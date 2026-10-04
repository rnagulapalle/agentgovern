import { cookies } from "next/headers";
import { database } from "@/lib/durable/database";
import { memberSession, WORKSPACE_COOKIE } from "@/lib/workspace/identity";
import {
  MarketingHeader,
  MarketingFooter,
} from "@/components/marketing/chrome";
import { ProductOverview } from "@/components/marketing/product-overview";
export async function workspaceMember() {
  const token = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!token) return null;
  try {
    return await memberSession(database(), token);
  } catch {
    return null;
  }
}
export function WorkspaceGate() {
  return (
    <div className="sales-page">
      <MarketingHeader />
      <ProductOverview gated />
      <MarketingFooter />
    </div>
  );
}
