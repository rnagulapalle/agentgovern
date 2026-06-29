import Link from "next/link";
import { ArrowRight, Check, X, CornerUpRight, Pencil, Clock } from "lucide-react";
import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro, RiskPill } from "@/components/agent-governance/ui";
import { APPROVALS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending: { label: "pending", icon: Clock, cls: "border-amber-500/25 bg-amber-500/[0.07] text-amber-300" },
  approved: { label: "approved", icon: Check, cls: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300" },
  edited: { label: "edited to 10%", icon: Pencil, cls: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300" },
  exception: { label: "exception", icon: CornerUpRight, cls: "border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-200" },
  rejected: { label: "rejected", icon: X, cls: "border-red-500/20 bg-red-500/[0.07] text-red-300" },
};

export default function ApprovalsPage() {
  const pending = APPROVALS.filter((a) => a.status === "pending");
  const history = APPROVALS.filter((a) => a.status !== "pending");

  return (
    <>
      <TopHeader crumbs={["queue"]} title="Approvals" />
      <PageMain>
        <PageIntro
          title="Approval queue"
          sub="Actions that exceeded an agent's delegated authority and need a human decision."
        />

        {/* Pending */}
        <div className="mb-2 flex items-center gap-2">
          <span className="label">Needs you</span>
          <span className="font-mono text-[11px] text-amber-300">{pending.length}</span>
        </div>
        <div className="space-y-2.5">
          {pending.map((a) => (
            <Link
              key={a.id}
              href="/agent-governance-demo"
              className="card block border-amber-500/20 bg-amber-500/[0.03] p-4 transition-colors hover:bg-amber-500/[0.06]"
            >
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-white/90">{a.action}</span>
                    <RiskPill risk={a.risk} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-white/40">
                    <span>{a.agent}</span>
                    <span>· {a.tool}</span>
                    <span>· {a.policy}</span>
                    <span>· {a.age}</span>
                  </div>
                </div>
                <span className="hidden items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white sm:inline-flex">
                  Review <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* History */}
        <div className="mb-2 mt-7 flex items-center gap-2">
          <span className="label">Resolved</span>
          <span className="font-mono text-[11px] text-white/35">{history.length}</span>
        </div>
        <div className="card overflow-hidden">
          <div className="divide-y divide-white/[0.05]">
            {history.map((a) => {
              const st = STATUS[a.status];
              const Icon = st.icon;
              return (
                <div key={a.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-white/85">{a.action}</span>
                      <span className="hidden shrink-0 rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-white/45 sm:inline">
                        {a.tool}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-white/35">
                      {a.agent} · {a.policy}
                    </div>
                  </div>
                  <span className={cn("chip font-mono", st.cls)}>
                    <Icon className="h-3 w-3" strokeWidth={2.4} />
                    {st.label}
                  </span>
                  <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-white/30 sm:block">
                    {a.age}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </PageMain>
    </>
  );
}
