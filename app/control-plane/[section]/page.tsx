import { notFound } from "next/navigation";
import { ControlScreen } from "@/components/control-plane/screens";
import type { Section } from "@/lib/control-plane/model";
import { SavedWorkspace } from "@/components/control-plane/saved-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
import { ControlCenter } from "@/components/control-plane/control-center";
const sections = [
  "workflows",
  "agents",
  "runs",
  "policies",
  "approvals",
  "gateway",
  "outputs",
  "reconciliation",
  "audit",
  "settings",
];
export default async function ControlPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ inspect?: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  if (process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile && (section === "approvals" || section === "policies")) return <ControlCenter page={section} awsEnabled={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"}/>;
  if (process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile && (section === "workflows" || section === "approvals" || section === "policies" || section === "outputs" || section === "reconciliation")) return <SavedWorkspace section={section} awsConnections={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"} />;
  const { inspect } = await searchParams;
  return (
    <ControlScreen section={section as Section} initialInspect={inspect} />
  );
}
