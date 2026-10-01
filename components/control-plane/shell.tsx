"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  GitBranch,
  History,
  LayoutGrid,
  Menu,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useControl } from "./provider";
import { BrandMark, Modal } from "./ui";

const groups = [
  {
    name: "WORKSPACE",
    items: [
      { key: "overview", label: "Overview", icon: LayoutGrid },
      { key: "workflows", label: "Workflow library", icon: BookOpen },
      { key: "agents", label: "Agent directory", icon: Bot },
      { key: "gateway", label: "Model gateway", icon: Network },
    ],
  },
  {
    name: "CONTROLS",
    items: [
      {
        key: "policies",
        label: "Action controls",
        icon: SlidersHorizontal,
      },
      { key: "runs", label: "Execution controls", icon: GitBranch },
      { key: "outputs", label: "Output controls", icon: Activity },
    ],
  },
  {
    name: "REVIEW",
    items: [
      { key: "approvals", label: "Approvals", icon: ShieldCheck },
      { key: "reconciliation", label: "Recovery", icon: Undo2 },
      { key: "audit", label: "Audit trail", icon: History },
    ],
  },
];
export function ControlShell({ children }: { children: React.ReactNode }) {
  const { state, toast } = useControl();
  const pathname = usePathname();
  const section = pathname.split("/")[2] || "overview";
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [help, setHelp] = useState(false);
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const incidents = state.incidents.filter(
    (i) => i.status !== "resolved",
  ).length;
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const title =
    groups.flatMap((g) => g.items).find((i) => i.key === section)?.label ||
    "Workspace settings";
  const results = [
    ...state.agents.map((a) => ({
      name: a.name,
      sub: `${a.role} · ${a.owner}`,
      href: `/control-plane/agents?inspect=${a.id}`,
      icon: Bot,
    })),
    ...state.runs.map((r) => ({
      name: r.name,
      sub: r.id,
      href: `/control-plane/runs?inspect=${r.id}`,
      icon: GitBranch,
    })),
    ...state.policies.map((p) => ({
      name: p.name,
      sub: `${p.stage} policy`,
      href: "/control-plane/policies",
      icon: ShieldCheck,
    })),
  ]
    .filter((r) =>
      `${r.name} ${r.sub}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);
  return (
    <div className="cp-app">
      <a href="#control-content" className="cp-skip">
        Skip to content
      </a>
      {menu && (
        <button
          className="cp-mobile-scrim"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`cp-sidebar ${menu ? "is-open" : ""}`}>
        <Link
          href="/"
          className="cp-brand"
          aria-label="Back to LoopLabs homepage"
        >
          <BrandMark />
          <span>
            LoopLabs
            <span className="cp-brand-sub">THE AGENT CONTROL PLANE</span>
          </span>
        </Link>
        <Link href="/control-plane/settings" className="cp-workspace">
          <span className="cp-workspace-icon">M</span>
          <span>
            <strong>Meridian workspace</strong>
            <small>Demo workspace</small>
          </span>
          <ChevronDown size={14} />
        </Link>
        <nav aria-label="Control plane navigation">
          {groups.map((group) => (
            <div className="cp-nav-group" key={group.name}>
              <div className="cp-nav-label">{group.name}</div>
              {group.items.map((item) => (
                <Link
                  key={item.key}
                  href={
                    item.key === "overview"
                      ? "/control-plane"
                      : `/control-plane/${item.key}`
                  }
                  className={`cp-nav-item ${section === item.key ? "is-active" : ""}`}
                  aria-current={section === item.key ? "page" : undefined}
                >
                  <item.icon size={17} strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {item.key === "approvals" && pending > 0 && (
                    <span className="cp-nav-count">{pending}</span>
                  )}
                  {item.key === "reconciliation" && incidents > 0 && (
                    <span className="cp-nav-alert" />
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="cp-sidebar-bottom">
          <div className="cp-enforcement">
            <div>
              <span className="cp-live-dot" />
              <strong>Governed by default</strong>
            </div>
            <p>Identity. Action. Execution. Output.</p>
            <div className="cp-enforcement-bars">
              {Array.from({ length: 30 }, (_, i) => (
                <i key={i} style={{ height: 8 + ((i * 7) % 13) }} />
              ))}
            </div>
            <span>
              INTERACTIVE DEMO <span>v0.1</span>
            </span>
          </div>
          <Link
            href="/control-plane/settings"
            className={`cp-nav-item ${section === "settings" ? "is-active" : ""}`}
          >
            <Settings2 size={17} strokeWidth={1.5} />
            Workspace settings
          </Link>
          <button className="cp-nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={17} strokeWidth={1.5} />
            Quick guide
            <ArrowUpRight size={13} className="cp-push" />
          </button>
          <Link href="/" className="cp-sidebar-user">
            <span className="cp-user-avatar">RN</span>
            <span>
              <strong>Raj Nagulapalle</strong>
              <small>Workspace admin · demo</small>
            </span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      <div className="cp-workarea">
        <header className="cp-topbar">
          <button
            className="cp-icon-button cp-mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="cp-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <div className="cp-topbar-right">
            <span className="cp-environment">
              <i />
              Demo workspace
            </span>
            <button
              className="cp-search-trigger"
              aria-label="Search workspace"
              onClick={() => setSearch(true)}
            >
              <Search size={15} />
              <span>Search anything</span>
              <kbd>
                <Command size={10} /> K
              </kbd>
            </button>
            <Link
              className="cp-notifications"
              href="/control-plane/approvals"
              aria-label={`${pending} pending approvals`}
            >
              <Bell size={17} />
              {pending > 0 && <i />}
            </Link>
            <span className="cp-user-avatar is-small">RN</span>
          </div>
        </header>
        <main id="control-content" className="cp-content">
          {children}
        </main>
        <footer className="cp-app-footer">
          <span>
            <BrandMark small /> Action, execution, and output controls
          </span>
          <span>Sample data · changes saved in this browser</span>
        </footer>
      </div>
      {toast && (
        <div role="status" className="cp-toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {search && (
        <Modal
          title="Find anything"
          subtitle="Search agents, executions, and policies in this workspace."
          onClose={() => setSearch(false)}
        >
          <div className="cp-search-input">
            <Search size={17} />
            <input
              autoFocus
              placeholder="Search by name, owner, or run ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search workspace"
            />
          </div>
          <div className="cp-search-results">
            {results.length ? (
              results.map((r, i) => (
                <Link
                  key={i}
                  href={r.href}
                  onClick={() => {
                    setSearch(false);
                    setQuery("");
                  }}
                >
                  <r.icon size={17} />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.sub}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              ))
            ) : (
              <p>No matches. Try an agent name or policy.</p>
            )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Meet your control plane"
          subtitle="One place to decide what agents can access, do, and release."
          onClose={() => setHelp(false)}
        >
          <div className="cp-guide">
            {[
              [
                "01",
                "Give every agent an identity",
                "Onboard an agent with an owner, a role, model access, tool permissions, and a budget.",
              ],
              [
                "02",
                "Check a proposed action",
                "Simulate a renewal offer. Change the discount or record age to see the existing policy engine allow, hold, or block it.",
              ],
              [
                "03",
                "Keep humans in control",
                "Review the exact proposed action. Suspend an agent or terminate a run to stop pending work.",
              ],
              [
                "04",
                "Recover carefully",
                "Open Recovery, isolate the agent, preview the recovery plan, and restore a reversible record only if its version still matches.",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <section>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="cp-note">
            <BookOpen size={17} />
            <p>
              This is an interactive product tour. Model calls, business actions,
              and recovery are simulated. Production identity and the Python
              gateway are not connected.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
