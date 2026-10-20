"use client";

import Link from "next/link";
import { useCompany } from "./company-workspace";
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
  Cloud,
  Command,
  Database,
  GitBranch,
  History,
  LayoutGrid,
  Menu,
  MessageSquare,
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
      { key: "work", label: "Workflow plans", icon: MessageSquare },
      { key: "quotes", label: "Distributor quotes", icon: BookOpen },
      { key: "history", label: "Saved decision history", icon: History },
      { key: "agents", label: "Agents", icon: Bot },
      { key: "discovery", label: "Cloud inventory", icon: Cloud },
      { key: "connectors", label: "Connections", icon: Database },
      { key: "records", label: "Records and access", icon: ShieldCheck },
      { key: "actions", label: "Actions", icon: SlidersHorizontal },
      { key: "verification", label: "Verification evidence", icon: ShieldCheck },
      { key: "workflow-runs", label: "Workflow runs", icon: Network },
      { key: "requests", label: "Sales requests", icon: BookOpen },
    ],
  },
  {
    name: "PREPARED EXAMPLES",
    items: [
      { key: "workflows", label: "Workflow examples", icon: Network },
      { key: "gateway", label: "Model access", icon: Activity },
      { key: "coding-agents", label: "Coding agents", icon: Command },
      { key: "runs", label: "Execution traces", icon: GitBranch },
      { key: "outputs", label: "Output checks", icon: ShieldCheck },
      { key: "reconciliation", label: "Recovery example", icon: Undo2 },
      { key: "audit", label: "Example history", icon: History },
    ],
  },
];
export function ControlScopeNote({ durable, quoteOnly = false, scriptDemo = false }: { durable: boolean; quoteOnly?: boolean; scriptDemo?: boolean }) {
  if (scriptDemo) return <p>Prepared samples use simulated business systems. Connected AWS workflows keep running in AWS and may use real business systems. LoopLabs reads their reported history; a configured shared approval connection can send your reviewed decision back. Mandatory execution checks and independent effect verification require separate connections.</p>;
  if (quoteOnly) return <p>Sample distributor quotes and simulated confirmations. Another named member must approve each exact action. No live customer records change and no customer email is delivered.</p>;
  return <p>{durable
    ? "Discounts change a sample record; refunds use a simulated payment provider. Decisions are saved on the server. No real money moves. When configured, AI helps prepare bounded customer acknowledgement plans; it cannot approve or execute actions. Business connectors remain simulated, with no live customer updates or real email delivery."
    : "These prepared examples use browser-local sample data. Model access, output checks and execution traces are simulated."}</p>;
}
export function ControlShell({
  children,
  member,
  quoteOnly = false,
  scriptDemo = false,
}: {
  children: React.ReactNode;
  member: { name: string; email: string; company?: string | null };
  quoteOnly?: boolean;
  scriptDemo?: boolean;
}) {
  const { state, toast } = useControl();
  const {snapshot:company}=useCompany();
  const companyName=company?.profile?.name || member.company;
  const pathname = usePathname();
  const section = pathname.split("/")[2] || "overview";
  const durable = scriptDemo || [
    "overview",
    "history",
    "work",
    "quotes",
    "actions",
    "agents",
    "discovery",
    "connectors",
    "records",
    "requests",
    "verification",
    "workflow-runs",
  ].includes(section);
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
      if (!durable && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [durable]);
  const savedNavigation = [{ name: "OPERATE", items: [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "agents", label: "Agents", icon: Bot },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "coding-agents", label: "Coding agents", icon: Command },
    { key: "approvals", label: "Approvals & outcomes", icon: ShieldCheck },
  ] }, { name: "CONFIGURE", items: [
    { key: "connectors", label: "Connections", icon: Database },
    { key: "policies", label: "Policies", icon: SlidersHorizontal },
  ] }];
  const navigation = quoteOnly ? [{ name: "QUOTE WORKSPACE", items: groups[0].items.filter(item => item.key === "quotes") }] : scriptDemo ? savedNavigation : groups;
  const title =
    navigation.flatMap((g) => g.items).find((i) => i.key === section)?.label ||
    (scriptDemo ? ({ quotes: "Quote workspace", actions: "Action details", discovery: "AWS connection", workflows: "Sample workflows", "workflow-runs": "Customer handoffs", history: "Saved decisions", organization: "Organization", reconciliation: "Outcome review", outputs: "Output controls" } as Record<string,string>)[section] || "Workspace" : "Example settings");
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
    <div className={`cp-app ph-no-capture${scriptDemo ? " cc-brand-system" : ""}`} data-private>
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
          prefetch={false}
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
        <Link
          prefetch={false}
          href={durable ? "/control-plane" : "/control-plane/settings"}
          className="cp-workspace"
        >
          <span className="cp-workspace-icon">{scriptDemo ? (companyName || "Company").slice(0,1) : "M"}</span>
          <span>
            <strong>
              {quoteOnly ? "Quote workspace" : durable ? (companyName || "Company workspace") : "Prepared examples"}
            </strong>
            <small>
              {quoteOnly ? "Sample data only" : durable ? "Company administration" : "Browser-local sample data"}
            </small>
          </span>
          <ChevronDown size={14} />
        </Link>
        <nav aria-label="Control plane navigation">
          {navigation.map((group) => (
            <div className="cp-nav-group" key={group.name}>
              <div className="cp-nav-label">{group.name}</div>
              {group.items.map((item) => (
                <Link
                  prefetch={false}
                  key={item.key}
                  href={
                    item.key === "overview"
                      ? "/control-plane"
                      : `/control-plane/${item.key}`
                  }
                  className={`cp-nav-item ${section === item.key ? "is-active" : ""}`}
                  aria-current={section === item.key ? "page" : undefined}
                  onClick={() => setMenu(false)}
                >
                  <item.icon size={17} strokeWidth={1.5} />
                  <span>{item.label}</span>
                  {!durable && item.key === "approvals" && pending > 0 && (
                    <span className="cp-nav-count">{pending}</span>
                  )}
                  {!durable &&
                    item.key === "reconciliation" &&
                    incidents > 0 && <span className="cp-nav-alert" />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="cp-sidebar-bottom">
          <div className="cp-enforcement" hidden={scriptDemo}>
            <div>
              <span className="cp-live-dot" />
              <strong>{quoteOnly ? "Quote action controls" : scriptDemo ? "Workspace controls" : "Governed by default"}</strong>
            </div>
            <p>{quoteOnly ? "Independent approval. Verified result." : scriptDemo ? "Named owners. Approval rules. Outcome checks." : "Identity. Action. Execution. Output."}</p>
            {!scriptDemo && <div className="cp-enforcement-bars">
              {Array.from({ length: 30 }, (_, i) => (
                <i key={i} style={{ height: 8 + ((i * 7) % 13) }} />
              ))}
            </div>}
            <span>
              {quoteOnly ? "SAMPLE QUOTE WORKSPACE" : durable ? "SAVED WORKSPACE" : "INTERACTIVE DEMO"}{" "}
              <span>v0.1</span>
            </span>
          </div>
          {scriptDemo && <Link prefetch={false} href="/control-plane/organization" className={`cp-nav-item ${section === "organization" ? "is-active" : ""}`}><Settings2 size={17} strokeWidth={1.5}/>Organization</Link>}
          {!quoteOnly && !scriptDemo && <Link
            prefetch={false}
            href="/control-plane/settings"
            className={`cp-nav-item ${section === "settings" ? "is-active" : ""}`}
          >
            <Settings2 size={17} strokeWidth={1.5} />
            Example settings
          </Link>}
          <button className="cp-nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={17} strokeWidth={1.5} />
            Quick guide
            <ArrowUpRight size={13} className="cp-push" />
          </button>
          <Link prefetch={false} href="/" className="cp-sidebar-user">
            <span className="cp-user-avatar">
              {member.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
              {scriptDemo && <small>Company administrator</small>}
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
            <span>{scriptDemo ? companyName || "Company" : "Workspace"}</span>
            <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <div className="cp-topbar-right">
            <span className="cp-environment">
              <i />
              {section === "coding-agents" ? "Interactive sample" : quoteOnly ? "Sample data only" : durable ? "Saved controls" : "Browser-local sample data"}
            </span>
            {!durable && (
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
            )}
            {!quoteOnly && !scriptDemo && <Link
              prefetch={false}
              className="cp-notifications"
              href={durable ? "/control-plane" : "/control-plane/approvals"}
              aria-label={
                durable ? "Action history" : `${pending} pending approvals`
              }
            >
              <Bell size={17} />
              {!durable && pending > 0 && <i />}
            </Link>}
            <button
              className="cp-button workspace-sign-out"
              onClick={async () => {
                const r = await fetch("/api/workspace/session", {
                  method: "DELETE",
                });
                if (r.ok) window.location.assign("/sign-in");
                else window.alert("Could not sign out. Please try again.");
              }}
            >
              Sign out
            </button>
          </div>
        </header>
        <main id="control-content" className="cp-content">
          {children}
        </main>
        <footer className="cp-app-footer">
          <span>
            <BrandMark small /> {scriptDemo ? "Action controls and saved decisions" : "Action, execution, and output controls"}
          </span>
          <span>
            {section === "coding-agents" ? "Session-only demo · no connected coding clients" : scriptDemo ? "Connected activity & saved decisions" : durable
              ? "Sample data · decisions saved on the server"
              : "Sample data · changes saved in this browser"}
          </span>
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
          title="Find a prepared example"
          subtitle="Search the prepared browser-local examples."
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
                  prefetch={false}
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
          title={quoteOnly ? "Explore quote controls" : "Meet your control plane"}
          subtitle={quoteOnly ? "Prepare a quote, get independent approval, and verify each result." : "One place to decide what agents can access, do, and release."}
          onClose={() => setHelp(false)}
        >
          <div className="cp-guide">
            {(quoteOnly ? [
              ["01", "Prepare a quote", "Select the enrolled sample quote and describe the discount. Review the quote and exact customer confirmation before submitting."],
              ["02", "Get independent approval", "The requester cannot approve their own actions. The designated manager reviews and approves the exact quote update."],
              ["03", "Verify the quote first", "Check the observed quote result. The customer confirmation stays held until the quote is verified and separately approved."],
              ["04", "Review the saved result", "Check the full result and reopen the saved request. Confirmation acceptance is simulated; it is not customer delivery."],
            ] : scriptDemo ? [
              ["01", "Define the agent’s scope", "For AWS agents, review the discovered identity and declared business ownership, then connect history and any supported approval interface. Prepared sample agents use a separately assigned action and request allowance."],
              ["02", "Review the action", "Review the exact proposed change and the rule holding it. A connected approval authorizes the workflow to continue; it does not prove execution or delivery completed."],
              ["03", "Follow workflow execution", "Inspect the workflow-reported steps and current approval readback. Mandatory execution checkpoints and independent effect verification are separate capabilities; history alone does not enforce them."],
              ["04", "Reconcile uncertain outcomes", "Reconciliation checks whether a change happened. Verify the saved result before trying again. Containment stops new work; it does not undo a change already accepted."],
            ] : durable
              ? [
                  [
                    "01",
                    "Register an agent",
                    "Assign an invited owner, one supported connector and a lifetime request allowance. Each agent receives only its allowed action.",
                  ],
                  [
                    "02",
                    "Set the rules",
                    "Choose discounts, refunds, CRM updates or messages. Discounts and refunds have amount rules. CRM and messages require approval from another named member.",
                  ],
                  [
                    "03",
                    "Review and execute",
                    "Submit a request, inspect the exact payload, approve a held action, and execute only if its authority remains valid.",
                  ],
                  [
                    "04",
                    "Verify before retry",
                    "Explore a lost response. Reconcile the observed outcome, and restore a discount only when no newer write would be overwritten.",
                  ],
                ]
              : [
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
                ]
            ).map(([n, t, d]) => (
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
            <ControlScopeNote durable={durable} quoteOnly={quoteOnly} scriptDemo={scriptDemo} />
          </div>
        </Modal>
      )}
    </div>
  );
}
