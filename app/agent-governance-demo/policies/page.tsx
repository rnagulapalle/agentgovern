import { ScrollText, Plus, Check } from "lucide-react";
import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro } from "@/components/agent-governance/ui";
import { POLICIES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function PoliciesPage() {
  return (
    <>
      <TopHeader crumbs={["governance"]} title="Policies" />
      <PageMain>
        <PageIntro
          title="Policy library"
          sub="Rules that bound what every agent may do autonomously — and what needs a human."
          action={
            <button className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-2 text-[13px] font-medium text-white/80 transition-all hover:bg-white/[0.05]">
              <Plus className="h-4 w-4" />
              New policy
            </button>
          }
        />

        <div className="space-y-2.5">
          {POLICIES.map((p) => {
            const star = p.id === "POL-SDR-DISCOUNT-002";
            return (
              <div
                key={p.id}
                className={cn(
                  "card p-4 transition-colors",
                  star ? "border-indigo-400/20 bg-indigo-500/[0.04]" : "hover:bg-white/[0.02]"
                )}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                      star
                        ? "border-indigo-400/30 bg-indigo-500/[0.08] text-indigo-300"
                        : "border-white/[0.08] bg-white/[0.03] text-white/55"
                    )}
                  >
                    <ScrollText className="h-4 w-4" strokeWidth={1.8} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold tracking-tight text-white/90">
                        {p.name}
                      </h3>
                      <span className="font-mono text-[11px] text-white/30">{p.id}</span>
                      {star && (
                        <span className="chip font-mono border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-200">
                          in this demo
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13px] text-white/55">{p.rule}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px]">
                      <span className="text-white/40">
                        scope <span className="text-white/65">{p.scope}</span>
                      </span>
                      <span className="text-white/40">
                        enforce <span className="text-white/65">{p.enforcement}</span>
                      </span>
                      <span className="text-white/40">
                        hits 24h <span className="text-white/65">{p.hits}</span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {p.status === "active" ? (
                      <span className="chip font-mono border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                        <Check className="h-3 w-3" strokeWidth={2.4} /> active
                      </span>
                    ) : (
                      <span className="chip font-mono border-white/10 bg-white/[0.03] text-white/50">
                        draft
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PageMain>
    </>
  );
}
