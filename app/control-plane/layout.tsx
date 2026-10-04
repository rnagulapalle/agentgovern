import type { Metadata } from "next";
import { ControlProvider } from "@/components/control-plane/provider";
import { ControlShell } from "@/components/control-plane/shell";
import "./control-plane.css";
import "../sales.css";
import { database } from "@/lib/durable/database";
import {
  workspaceMember,
  WorkspaceGate,
} from "@/components/control-plane/workspace-gate";

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
  const actor = await workspaceMember();
  if (!actor) return <WorkspaceGate />;
  const { rows } = await database().query(
    "SELECT name,email FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true",
    [actor.orgId, actor.subject],
  );
  if (!rows[0]) return <WorkspaceGate />;
  return (
    <ControlProvider>
      <ControlShell member={rows[0]}>{children}</ControlShell>
    </ControlProvider>
  );
}
