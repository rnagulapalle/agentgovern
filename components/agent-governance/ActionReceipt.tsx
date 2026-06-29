"use client";

import { ShieldCheck, CornerUpRight, XCircle, BadgeCheck, Download } from "lucide-react";
import type { Decision } from "@/lib/types";
import { cn } from "@/lib/utils";

const RESULT: Record<
  Exclude<Decision, null>,
  {
    label: string;
    tone: string;
    icon: React.ElementType;
    output: (d: number) => string;
    approver: string;
  }
> = {
  approved: {
    label: "Approved",
    tone: "emerald",
    icon: ShieldCheck,
    output: (d) =>
      `Email sent to john@acme.com with a ${d}% discount — within delegated authority, no human approval required.`,
    approver: "Auto · within authority",
  },
  edited: {
    label: "Approved",
    tone: "emerald",
    icon: ShieldCheck,
    output: () =>
      "Email sent to john@acme.com with a 10% discount (auto-corrected to policy cap).",
    approver: "Raj · auto-corrected",
  },
  exception: {
    label: "Approved · exception",
    tone: "indigo",
    icon: CornerUpRight,
    output: (d) =>
      `Email sent to john@acme.com with a ${d}% discount under a signed one-time exception.`,
    approver: "Raj · manager override",
  },
  rejected: {
    label: "Rejected",
    tone: "red",
    icon: XCircle,
    output: () =>
      "No email sent. Agent notified to revise the discount within policy and resubmit.",
    approver: "Raj · denied",
  },
};

const TONE: Record<string, { chip: string; text: string; dot: string }> = {
  emerald: {
    chip: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-200",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  indigo: {
    chip: "border-indigo-400/25 bg-indigo-500/[0.08] text-indigo-200",
    text: "text-indigo-300",
    dot: "bg-indigo-400",
  },
  red: {
    chip: "border-red-500/25 bg-red-500/[0.07] text-red-200",
    text: "text-red-300",
    dot: "bg-red-400",
  },
};

function Row({
  label,
  children,
  mono,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[7px]">
      <span className="label">{label}</span>
      <span
        className={cn(
          "text-right text-[12px] text-white/80",
          mono && "font-mono text-white/70",
          tone
        )}
      >
        {children}
      </span>
    </div>
  );
}

export function ActionReceipt({
  decision,
  timestamp,
  discount,
  evidenceHash,
  signature,
  riskScore,
  freshness,
}: {
  decision: Exclude<Decision, null>;
  timestamp: string;
  discount: number;
  evidenceHash: string;
  signature: string;
  riskScore: number;
  freshness: string;
}) {
  const r = RESULT[decision];
  const shortHash = `${evidenceHash.slice(0, 6)}…${evidenceHash.slice(-4)}`;
  const sigOk = signature.startsWith("ed25519:");
  const tone = TONE[r.tone];
  const Icon = r.icon;

  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0b0d] shadow-2xl shadow-black/50">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="dots">
          <span className="bg-[#ff5f57]" />
          <span className="bg-[#febc2e]" />
          <span className="bg-[#28c840]" />
        </div>
        <span className="ml-2 font-mono text-[11px] text-white/40">
          receipt · act_9281.json
        </span>
        <span className={cn("ml-auto chip font-mono", tone.chip)}>
          <Icon className="h-3 w-3" strokeWidth={2.4} />
          {r.label}
        </span>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold tracking-tight text-white">
            Agent Action Receipt
          </h3>
          <span className="font-mono text-[11px] text-white/30">
            seq 9281 · immutable
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div className="divide-y divide-white/[0.05]">
            <Row label="Agent" mono>SDR-Agent-17</Row>
            <Row label="Owner">Raj Nagulapalle</Row>
            <Row label="Tool">Gmail</Row>
            <Row label="Action">Send email</Row>
            <Row label="Source" mono>{freshness}</Row>
            <Row label="Approved by">{r.approver}</Row>
          </div>
          <div className="divide-y divide-white/[0.05]">
            <Row label="Policy result" tone={cn("font-semibold", tone.text)}>
              {r.label}
            </Row>
            <Row label="Risk score" mono>{riskScore}/100</Row>
            <Row label="Timestamp" mono>{timestamp}</Row>
            <Row label="Audit">
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <BadgeCheck className="h-3.5 w-3.5" /> replayable
              </span>
            </Row>
            <Row label="Evidence hash" mono>{shortHash}</Row>
            <Row label="Signature" mono>{sigOk ? "ed25519 ✓" : "unsigned"}</Row>
          </div>
        </div>

        {/* Input / output */}
        <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="inset p-3">
            <div className="label mb-1.5">Input</div>
            <p className="font-mono text-[11px] leading-relaxed text-white/55">
              “Follow up with John from Acme. Offer 25% off, update HubSpot,
              schedule a call tomorrow if no reply.”
            </p>
          </div>
          <div className="inset p-3">
            <div className="label mb-1.5">Output</div>
            <p className="font-mono text-[11px] leading-relaxed text-white/55">
              {r.output(discount)}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
        <div className="font-mono text-[10px] text-white/30">
          chain: blk_0x4f2a · verifiable on AgentGovernance ledger
        </div>
        <button className="inline-flex items-center gap-1.5 font-mono text-[11px] text-white/55 transition-colors hover:text-white">
          <Download className="h-3.5 w-3.5" />
          export
        </button>
      </div>
    </div>
  );
}
