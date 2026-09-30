import { notFound } from "next/navigation";
import { ControlScreen } from "@/components/control-plane/screens";
import type { Section } from "@/lib/control-plane/model";
const sections = [
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
  const { inspect } = await searchParams;
  return (
    <ControlScreen section={section as Section} initialInspect={inspect} />
  );
}
