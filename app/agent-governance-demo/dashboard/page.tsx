import Link from "next/link";
import { ArrowUpRight, ArrowRight, Check, Ban, CornerUpRight, Zap } from "lucide-react";
import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro } from "@/components/agent-governance/ui";
import { DASH_STATS, RECENT_ACTIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STAT_TONE: Record<string, string> = {
  neutral: "text-white/70",
  up: "text-emerald-300",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-300",
};

const VERDICT: Record<
  string,
  { label: string; icon: React.ElementType; cls: string }
> = {
  auto: { label: "auto", icon: Check, cls: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300" },
  approved: { label: "approved", icon: Check, cls: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300" },
  exception: { label: "exception", icon: CornerUpRight, cls: "border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-200" },
  blocked: { label: "blocked", icon: Ban, cls: "border-red-500/20 bg-red-500/[0.07] text-red-300" },
};

export default function DashboardPage() {
  return (
    <>
      <TopHeader crumbs={["overview"]} title="Dashboard" />
      <PageMain>
        <PageIntro
          title="Control plane overview"
          sub="Every action your agents take — across identity, policy, approval, and audit."
          action={
            <Link
              href="/agent-governance-demo"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500"
            >
              <Zap className="h-4 w-4 fill-current" />
              Open live review
            </Link>
          }
        />

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {DASH_STATS.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="label">{s.label}</div>
              <div className="mt-2 text-[26px] font-semibold tracking-tight text-white tabular-nums">
                {s.value}
              </div>
              <div className={cn("mt-1 font-mono text-[11px]", STAT_TONE[s.tone])}>
                {s.delta}
              </div>
            </div>
          ))}
        </div>

        {/* Recent actions */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="card xl:col-span-2">
            <div className="card-head">
              <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
                Recent agent actions
              </h3>
              <Link
                href="/agent-governance-demo"
                className="flex items-center gap-1 font-mono text-[11px] text-white/40 transition-colors hover:text-white/70"
              >
                view audit trail <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {RECENT_ACTIONS.map((a, i) => {
                const v = VERDICT[a.verdict];
                const Icon = v.icon;
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-white/85">
                          {a.action}
                        </span>
                        <span className="hidden shrink-0 rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-white/45 sm:inline">
                          {a.tool}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-white/35">{a.agent}</div>
                    </div>
                    <span className={cn("chip font-mono", v.cls)}>
                      <Icon className="h-3 w-3" strokeWidth={2.4} />
                      {v.label}
                    </span>
                    <span className="hidden w-10 shrink-0 text-right font-mono text-[11px] text-white/30 sm:block">
                      {a.time}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side: posture */}
          <div className="space-y-6">
            <div className="card p-4">
              <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-white/90">
                Today&apos;s policy saves
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Discounts over cap", n: 4, tone: "bg-amber-400" },
                  { label: "Restricted tool calls", n: 2, tone: "bg-red-400" },
                  { label: "PII export attempts", n: 1, tone: "bg-red-400" },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-white/65">{r.label}</span>
                      <span className="font-mono text-white/45">{r.n}</span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={cn("h-full rounded-full", r.tone)} style={{ width: `${r.n * 22}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Link href="/agent-governance-demo/approvals" className="card block p-4 transition-colors hover:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
                  Pending approvals
                </h3>
                <ArrowUpRight className="h-4 w-4 text-white/30" />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[26px] font-semibold tabular-nums text-amber-300">1</span>
                <p className="text-[12px] text-white/45">
                  SDR-Agent-17 wants to send a 25% discount — above its 10% authority.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </PageMain>
    </>
  );
}
