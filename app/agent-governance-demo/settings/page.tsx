import { TopHeader } from "@/components/agent-governance/TopHeader";
import { PageMain, PageIntro } from "@/components/agent-governance/ui";
import { cn } from "@/lib/utils";

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        on ? "border-indigo-500/40 bg-indigo-600/80" : "border-white/10 bg-white/[0.05]"
      )}
    >
      <span
        className={cn(
          "absolute h-3.5 w-3.5 rounded-full bg-white transition-all",
          on ? "left-[18px]" : "left-0.5"
        )}
      />
    </span>
  );
}

const SECTIONS = [
  {
    title: "Organization",
    rows: [
      { label: "Workspace", value: "Acme Corp", kind: "text" },
      { label: "Environment", value: "Sandbox", kind: "text" },
      { label: "Default session TTL", value: "24h", kind: "text" },
    ],
  },
  {
    title: "Delegation defaults",
    rows: [
      { label: "Sub-agents inherit read-only scope", value: true, kind: "toggle" },
      { label: "Require owner on every agent", value: true, kind: "toggle" },
      { label: "Auto-expire idle sessions", value: true, kind: "toggle" },
    ],
  },
  {
    title: "Approvals routing",
    rows: [
      { label: "Escalate High-risk to manager", value: true, kind: "toggle" },
      { label: "Slack notifications", value: true, kind: "toggle" },
      { label: "Allow one-time exceptions", value: false, kind: "toggle" },
    ],
  },
  {
    title: "Audit & retention",
    rows: [
      { label: "Receipt retention", value: "7 years", kind: "text" },
      { label: "Cryptographic signing", value: "ed25519", kind: "text" },
      { label: "Immutable ledger", value: true, kind: "toggle" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <>
      <TopHeader crumbs={["account"]} title="Settings" />
      <PageMain>
        <PageIntro
          title="Settings"
          sub="Org-wide defaults for identity, delegation, approvals, and audit."
          action={
            <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2 font-mono text-[12px] text-white/40">
              read-only · demo
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {SECTIONS.map((s) => (
            <div key={s.title} className="card">
              <div className="card-head">
                <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
                  {s.title}
                </h3>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {s.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-4 px-4 py-3">
                    <span className="text-[13px] text-white/70">{r.label}</span>
                    {r.kind === "toggle" ? (
                      <Toggle on={r.value as boolean} />
                    ) : (
                      <span className="font-mono text-[12px] text-white/55">{r.value as string}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageMain>
    </>
  );
}
