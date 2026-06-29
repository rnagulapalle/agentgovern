"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  ScrollText,
  CheckSquare,
  ListTree,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = "/agent-governance-demo";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, href: `${BASE}/dashboard` },
  { label: "Agents", icon: Bot, href: `${BASE}/agents` },
  { label: "Policies", icon: ScrollText, href: `${BASE}/policies` },
  { label: "Approvals", icon: CheckSquare, href: `${BASE}/approvals`, badge: 1 },
  { label: "Audit Trail", icon: ListTree, href: BASE },
  { label: "Trust Reports", icon: ShieldCheck, href: `${BASE}/trust-reports` },
  { label: "Settings", icon: Settings, href: `${BASE}/settings` },
];

function Mark() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M12 2.5 4.5 5.5v6c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5v-6L12 2.5Z"
          stroke="#818cf8"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="m8.8 12 2.2 2.2 4.2-4.4" stroke="#818cf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0c] px-3 py-4 lg:flex">
      {/* Wordmark */}
      <Link href={BASE} className="flex items-center gap-2.5 px-2 pb-6">
        <Mark />
        <div className="leading-none">
          <div className="text-[14px] font-semibold tracking-tight text-white">
            Agent<span className="text-white/55">Governance</span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
            Control Plane
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                active
                  ? "bg-white/[0.05] text-white"
                  : "text-white/50 hover:bg-white/[0.03] hover:text-white/80"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-indigo-400" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-white/90" : "text-white/35 group-hover:text-white/70"
                )}
                strokeWidth={1.9}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1 font-mono text-[10px] font-medium text-amber-300">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Fleet status */}
      <div className="mt-auto rounded-lg border border-white/[0.06] bg-white/[0.015] p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="label">Agent Fleet</span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            live
          </span>
        </div>
        <div className="flex items-stretch divide-x divide-white/[0.06]">
          {[
            { n: "24", l: "active" },
            { n: "3", l: "review" },
            { n: "1.2k", l: "actions" },
          ].map((s) => (
            <div key={s.l} className="flex-1 px-2 text-center first:pl-0 last:pr-0">
              <div className="font-mono text-[15px] font-medium tabular-nums text-white/90">
                {s.n}
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-white/30">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
