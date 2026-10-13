import { cookies } from "next/headers";
import { quoteDemoProfile, scriptDemoProfile } from "../../lib/workspace/deployment-capabilities";
import { tenantContext } from "../../lib/workspace/tenant-context";
import { WORKSPACE_COOKIE } from "../../lib/workspace/identity";
import {
  MarketingHeader,
  MarketingFooter,
} from "../marketing/chrome";
import { ProductOverview } from "../marketing/product-overview";
export async function workspaceContext() {
  const token = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!token) return null;
  try {
    return await tenantContext().member(token);
  } catch {
    return null;
  }
}
export async function workspaceMember() { return (await workspaceContext())?.actor ?? null; }
export function WorkspaceGate() {
  return (
    <div className="sales-page">
      <MarketingHeader />
      <ProductOverview gated quoteOnly={process.env.LOOPLABS_DEPLOYMENT_PROFILE === quoteDemoProfile} scriptDemo={process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile} />
      <MarketingFooter />
    </div>
  );
}
