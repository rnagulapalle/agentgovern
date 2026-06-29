"use client";

import { Radio, Search, Bell, ChevronRight } from "lucide-react";

export function TopHeader({
  crumbs,
  title,
  live = false,
}: {
  crumbs: string[];
  title: string;
  live?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-bg/80 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-4 px-5 sm:px-7">
        {/* Breadcrumb / title */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="hidden items-center gap-1.5 font-mono text-[11px] text-white/35 sm:flex">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span className={i === crumbs.length - 1 ? "text-white/55" : ""}>{c}</span>
              </span>
            ))}
          </div>
          <span className="hidden h-3.5 w-px bg-white/10 sm:block" />
          <h1 className="text-[13px] font-semibold tracking-tight text-white/90">
            {title}
          </h1>
        </div>

        {/* Environment + live */}
        <span className="ml-1 hidden items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-white/55 sm:inline-flex">
          demo · sandbox
        </span>
        {live && (
          <span className="hidden items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-1 font-mono text-[11px] text-emerald-300 md:inline-flex">
            <Radio className="h-3 w-3 animate-pulse" />
            live simulation
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button className="hidden items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-white/40 transition-colors hover:text-white/70 md:flex">
            <Search className="h-3.5 w-3.5" />
            Search
            <span className="kbd ml-1">⌘K</span>
          </button>
          <button className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.07] bg-white/[0.02] text-white/45 transition-colors hover:text-white/80">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2.5 rounded-md border border-white/[0.07] bg-white/[0.02] py-1 pl-1 pr-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-white/[0.06] text-[11px] font-semibold text-white/80">
              R
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-[12px] font-medium text-white/85">Raj</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
