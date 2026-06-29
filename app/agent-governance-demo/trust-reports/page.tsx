import Link from "next/link";
import { ShieldCheck, Check, Globe, ArrowRight } from "lucide-react";
import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro } from "@/components/agent-governance/ui";
import { TRUST_PASSED, TRUST_MISSING } from "@/lib/mock-data";

export default function TrustReportsPage() {
  return (
    <>
      <TopHeader crumbs={["governance"]} title="Trust Reports" />
      <PageMain>
        <PageIntro
          title="Trust reports"
          sub="Turn every agent's audit record into evidence your customers and auditors can verify."
          action={
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 font-mono text-[12px] text-white/40">
              publishing · soon
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Posture */}
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-indigo-300" />
              <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
                Fleet trust posture
              </h3>
            </div>
            <div className="space-y-2.5">
              {TRUST_PASSED.map((p) => (
                <div key={p} className="flex items-center gap-2 text-[13px] text-white/70">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.4} />
                  {p}
                </div>
              ))}
              {TRUST_MISSING.map((m) => (
                <div key={m} className="flex items-center gap-2 text-[13px] text-white/45">
                  <span className="ml-0.5 mr-0.5 h-1 w-2.5 shrink-0 rounded-full bg-amber-500/50" />
                  {m}
                </div>
              ))}
            </div>
          </div>

          {/* Public trust center preview */}
          <div className="card overflow-hidden">
            <div className="card-head">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-white/55" />
                <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
                  Public trust center
                </h3>
              </div>
              <span className="font-mono text-[11px] text-white/30">preview</span>
            </div>
            <div className="p-5">
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-4">
                <div className="font-mono text-[11px] text-white/35">trust.acme.com/agents</div>
                <div className="mt-3 text-[15px] font-semibold text-white">
                  Acme runs AI agents you can verify.
                </div>
                <p className="mt-1.5 text-[12px] text-white/50">
                  Every customer-facing action is identity-bound, policy-checked,
                  and backed by a replayable receipt.
                </p>
                <div className="mt-3 flex gap-2">
                  {["Identity", "Policy", "Approvals", "Audit"].map((t) => (
                    <span key={t} className="chip font-mono border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
                      <Check className="h-3 w-3" strokeWidth={2.4} /> {t}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-[12px] text-white/40">
                A shareable page that proves your agents are governed — without
                exposing internal logs.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/agent-governance-demo"
          className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] text-indigo-300 transition-colors hover:text-indigo-200"
        >
          see how a single action becomes a receipt <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PageMain>
    </>
  );
}
