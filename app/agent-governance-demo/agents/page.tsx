import Link from "next/link";
import { Bot, ArrowUpRight, Plus } from "lucide-react";
import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro, RiskPill, TrustMeter } from "@/components/agent-governance/ui";
import { FLEET } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  active: { label: "active", dot: "bg-emerald-400", text: "text-emerald-300" },
  review: { label: "in review", dot: "bg-amber-400", text: "text-amber-300" },
  paused: { label: "paused", dot: "bg-white/35", text: "text-white/45" },
};

export default function AgentsPage() {
  return (
    <>
      <TopHeader crumbs={["fleet"]} title="Agents" />
      <PageMain>
        <PageIntro
          title="Agent fleet"
          sub="Every agent has a verifiable identity, an owner, scoped tools, and a trust score."
          action={
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-2 text-[13px] font-medium text-white/80 transition-all hover:bg-white/[0.05]">
              <Plus className="h-4 w-4" />
              Register agent
            </button>
          }
        />

        <div className="card overflow-hidden">
          {/* table head */}
          <div className="hidden grid-cols-12 gap-3 border-b border-white/[0.06] px-4 py-2.5 lg:grid">
            <div className="col-span-4 label">Agent</div>
            <div className="col-span-2 label">Owner</div>
            <div className="col-span-2 label">Tools</div>
            <div className="col-span-1 label">Risk</div>
            <div className="col-span-2 label">Trust</div>
            <div className="col-span-1 label text-right">Status</div>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {FLEET.map((a) => {
              const st = STATUS[a.status];
              const isStar = a.name === "SDR-Agent-17";
              const row = (
                <div
                  className={cn(
                    "grid grid-cols-2 items-center gap-3 px-4 py-3.5 transition-colors lg:grid-cols-12",
                    isStar ? "bg-indigo-500/[0.04] hover:bg-indigo-500/[0.07]" : "hover:bg-white/[0.02]"
                  )}
                >
                  {/* agent */}
                  <div className="col-span-2 flex items-center gap-3 lg:col-span-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                      <Bot className="h-4 w-4 text-white/65" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-white/90">
                        {a.name}
                        {isStar && <ArrowUpRight className="h-3.5 w-3.5 text-indigo-300" />}
                      </div>
                      <div className="truncate font-mono text-[11px] text-white/35">{a.role}</div>
                    </div>
                  </div>
                  {/* owner */}
                  <div className="hidden text-[12px] text-white/65 lg:col-span-2 lg:block">{a.owner}</div>
                  {/* tools */}
                  <div className="hidden flex-wrap gap-1 lg:col-span-2 lg:flex">
                    {a.tools.slice(0, 2).map((t) => (
                      <span key={t} className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-white/55">
                        {t}
                      </span>
                    ))}
                    {a.tools.length > 2 && (
                      <span className="font-mono text-[10px] text-white/30">+{a.tools.length - 2}</span>
                    )}
                  </div>
                  {/* risk */}
                  <div className="lg:col-span-1"><RiskPill risk={a.risk} /></div>
                  {/* trust */}
                  <div className="hidden lg:col-span-2 lg:block"><TrustMeter score={a.trust} /></div>
                  {/* status */}
                  <div className="flex items-center justify-end gap-1.5 lg:col-span-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                    <span className={cn("font-mono text-[11px]", st.text)}>{st.label}</span>
                  </div>
                </div>
              );
              return isStar ? (
                <Link key={a.name} href="/agent-governance-demo">{row}</Link>
              ) : (
                <div key={a.name}>{row}</div>
              );
            })}
          </div>
        </div>

        <p className="mt-3 px-1 font-mono text-[11px] text-white/30">
          SDR-Agent-17 has a pending action — open it in the live review.
        </p>
      </PageMain>
    </>
  );
}
