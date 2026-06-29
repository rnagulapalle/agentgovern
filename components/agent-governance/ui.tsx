import { cn } from "@/lib/utils";
import {
  Check,
  Ban,
  ShieldAlert,
  CircleDashed,
  X,
  CornerUpRight,
  type LucideIcon,
} from "lucide-react";
import type { ActionStatus } from "@/lib/mock-data";

/* ---------------------------------------------------------------- */
/*  Status badge — single source of truth for action state styling  */
/* ---------------------------------------------------------------- */

const STATUS_MAP: Record<
  ActionStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: {
    label: "Pending",
    icon: CircleDashed,
    className: "border-white/10 bg-white/[0.03] text-white/55",
  },
  "auto-approved": {
    label: "Auto-approved",
    icon: Check,
    className: "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300",
  },
  blocked: {
    label: "Blocked",
    icon: Ban,
    className: "border-red-500/25 bg-red-500/[0.07] text-red-300",
  },
  "requires-approval": {
    label: "Requires approval",
    icon: ShieldAlert,
    className: "border-amber-500/25 bg-amber-500/[0.07] text-amber-300",
  },
  executed: {
    label: "Executed",
    icon: Check,
    className: "border-emerald-500/25 bg-emerald-500/[0.1] text-emerald-200",
  },
  "executed-exception": {
    label: "Executed · exception",
    icon: CornerUpRight,
    className: "border-indigo-400/25 bg-indigo-500/[0.1] text-indigo-200",
  },
  rejected: {
    label: "Rejected",
    icon: X,
    className: "border-red-500/25 bg-red-500/[0.07] text-red-300",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ActionStatus;
  className?: string;
}) {
  const s = STATUS_MAP[status];
  const Icon = s.icon;
  return (
    <span className={cn("chip font-mono", s.className, className)}>
      <Icon className="h-3 w-3" strokeWidth={2.4} />
      {s.label}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/*  Section heading — mono index + title, hairline rule              */
/* ---------------------------------------------------------------- */

export function SectionLabel({
  index,
  title,
  hint,
}: {
  index: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <span className="font-mono text-[11px] text-white/25">{index}</span>
      <h2 className="text-[13px] font-semibold tracking-tight text-white/90">
        {title}
      </h2>
      {hint ? (
        <span className="ml-auto font-mono text-[11px] text-white/30">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Verdict pill for policy rows                                      */
/* ---------------------------------------------------------------- */

export function VerdictPill({
  verdict,
}: {
  verdict: "allowed" | "scoped" | "blocked";
}) {
  if (verdict === "allowed") {
    return (
      <span className="chip font-mono border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300">
        <Check className="h-3 w-3" strokeWidth={2.4} /> allowed
      </span>
    );
  }
  if (verdict === "scoped") {
    return (
      <span className="chip font-mono border-white/10 bg-white/[0.03] text-white/60">
        <CornerUpRight className="h-3 w-3" strokeWidth={2.4} /> scoped
      </span>
    );
  }
  return (
    <span className="chip font-mono border-red-500/25 bg-red-500/[0.07] text-red-300">
      <Ban className="h-3 w-3" strokeWidth={2.4} /> blocked
    </span>
  );
}

/* ---------------------------------------------------------------- */
/*  Page scaffolding shared across product pages                     */
/* ---------------------------------------------------------------- */

export function PageMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6 sm:px-7 sm:py-8">
      {children}
    </main>
  );
}

export function PageIntro({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-[13px] text-white/45">{sub}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Risk + trust helpers (shared across product pages)               */
/* ---------------------------------------------------------------- */

const RISK_TONE: Record<string, string> = {
  Low: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300",
  Medium: "border-amber-500/20 bg-amber-500/[0.07] text-amber-300",
  High: "border-red-500/20 bg-red-500/[0.07] text-red-300",
};

export function RiskPill({ risk }: { risk: string }) {
  return <span className={cn("chip font-mono", RISK_TONE[risk])}>{risk.toLowerCase()}</span>;
}

export function trustTone(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 68) return "text-amber-300";
  return "text-red-300";
}

/** Mini horizontal trust meter used in tables. */
export function TrustMeter({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={cn(
            "h-full rounded-full",
            score >= 80 ? "bg-emerald-400" : score >= 68 ? "bg-amber-400" : "bg-red-400"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("font-mono text-[12px] tabular-nums", trustTone(score))}>
        {score}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Button                                                            */
/* ---------------------------------------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
};

export function Button({
  variant = "secondary",
  icon: Icon,
  className,
  children,
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-500 border border-indigo-500/40",
    secondary:
      "border border-white/[0.09] bg-white/[0.02] text-white/80 hover:bg-white/[0.05] hover:text-white",
    ghost: "text-white/55 hover:bg-white/[0.04] hover:text-white/90",
    danger:
      "border border-red-500/25 bg-red-500/[0.06] text-red-200 hover:bg-red-500/[0.12]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
        variants[variant],
        className
      )}
      {...props}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}
