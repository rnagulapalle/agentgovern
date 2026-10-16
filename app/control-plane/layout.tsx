import type { Metadata } from "next";
import { quoteDemoProfile, scriptDemoProfile } from "../../lib/workspace/deployment-capabilities";
import { ControlProvider } from "../../components/control-plane/provider";
import { ControlShell } from "../../components/control-plane/shell";
import "./control-plane.css";
import "../../components/control-plane/control-center.css";
import "../sales.css";
import {
  workspaceContext,
  WorkspaceGate,
} from "../../components/control-plane/workspace-gate";

export const metadata: Metadata = {
  title: "Interactive agent control plane",
  description:
    "Explore how LoopLabs builds agent workflows, controls actions and execution, checks outputs, and recovers affected state.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/control-plane" },
};
export default async function ControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await workspaceContext();
  if (!context) return <WorkspaceGate />;
  const { db, actor } = context;
  const { rows } = await db.query(
    "SELECT name,email FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true",
    [actor.orgId, actor.subject],
  );
  if (!rows[0]) return <WorkspaceGate />;
  return (
    <ControlProvider>
      <ControlShell member={rows[0]} quoteOnly={process.env.LOOPLABS_DEPLOYMENT_PROFILE === quoteDemoProfile} scriptDemo={process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile}>{children}</ControlShell>
    </ControlProvider>
  );
}
