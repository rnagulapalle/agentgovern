"use client";

import { Bot, Copy, Check } from "lucide-react";
import { AGENT } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function ToolPill({ name, allowed }: { name: string; allowed: boolean }) {
  return (
    <span
      className={cn(
        "chip font-mono",
        allowed
          ? "border-white/[0.08] bg-white/[0.02] text-white/70"
          : "border-white/[0.06] bg-transparent text-white/30 line-through decoration-white/20"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          allowed ? "bg-emerald-400" : "bg-white/20"
        )}
      />
      {name}
    </span>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div
        className={cn(
          "truncate text-[13px] text-white/85",
          mono && "font-mono text-[12px] text-white/70"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function AgentIdentityCard() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
            <Bot className="h-5 w-5 text-white/70" strokeWidth={1.8} />
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface bg-emerald-400">
              <Check className="h-2 w-2 text-emerald-950" strokeWidth={3.5} />
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-white">
              {AGENT.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-white/40">
              <span className="truncate">{AGENT.fingerprint}</span>
              <Copy className="h-3 w-3 shrink-0 cursor-pointer text-white/25 transition-colors hover:text-white/60" />
            </div>
          </div>
        </div>
        <span className="chip shrink-0 font-mono border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
          verified
        </span>
      </div>

      {/* Fields */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 px-4">
        <Field label="Owner" value={AGENT.owner} />
        <Field label="Role" value={AGENT.role} />
        <Field label="Delegated by" value={AGENT.delegatedBy} />
        <Field label="Risk tier" value={AGENT.riskTier} />
        <Field label="Session" value={`expires ${AGENT.sessionExpires}`} mono />
        <Field label="Remaining" value={AGENT.sessionRemaining} mono />
      </div>

      {/* Tool scopes */}
      <div className="mt-4 space-y-3 border-t border-white/[0.06] px-4 py-3.5">
        <div>
          <div className="label mb-2">Allowed tools</div>
          <div className="flex flex-wrap gap-1.5">
            {AGENT.allowedTools.map((t) => (
              <ToolPill key={t} name={t} allowed />
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Restricted tools</div>
          <div className="flex flex-wrap gap-1.5">
            {AGENT.restrictedTools.map((t) => (
              <ToolPill key={t} name={t} allowed={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
