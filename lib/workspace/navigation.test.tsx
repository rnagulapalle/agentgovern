import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ControlScopeNote, ControlShell } from "../../components/control-plane/shell";
import { WorkspaceOverview } from "../../components/control-plane/workspace-overview";

const links = vi.hoisted(() => [] as { href: string; prefetch?: boolean }[]);
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  }) => {
    links.push({ href, prefetch });
    return createElement("a", { ...rest, href }, children);
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/control-plane" }));
vi.mock("../../components/control-plane/provider", () => ({
  useControl: () => ({
    state: { approvals: [], incidents: [], agents: [], runs: [], policies: [] },
    toast: null,
  }),
}));

it("keeps private navigation available without speculative requests exhausting the shared ingress burst", () => {
  links.length = 0;
  const html = renderToStaticMarkup(
    <ControlShell member={{ name: "Member", email: "member@example.test" }}>
      <WorkspaceOverview />
    </ControlShell>,
  );
  expect(html).toContain("Control plane navigation");
  expect(links.some((l) => l.href === "/control-plane/agents")).toBe(true);
  expect(links.some((l) => l.href === "/control-plane/records")).toBe(true);
  expect(links.some((l) => l.href === "/control-plane/work")).toBe(true);
  expect(links.some((l) => l.href === "/control-plane/verification")).toBe(
    true,
  );
  expect(links.length).toBeGreaterThan(12);
  expect(links.filter((l) => l.prefetch !== false)).toEqual([]);
});

it("distinguishes optional bounded AI planning from simulated business execution in the overview", () => {
  const html = renderToStaticMarkup(<WorkspaceOverview />);
  expect(html).toContain("When configured, AI helps prepare this bounded plan");
  expect(html).toContain("it cannot approve or execute actions");
  expect(html).toContain("no live customer updates or real email delivery");
  expect(html).toContain("No real money moves");
  expect(html).not.toContain("no AI model is called");
  expect(html).not.toContain("No live customer systems or AI model are connected");
});

it("keeps private workspace help and browser-local example scope distinct", () => {
  const workspace = renderToStaticMarkup(<ControlScopeNote durable />);
  expect(workspace).toContain("When configured, AI helps prepare bounded customer acknowledgement plans");
  expect(workspace).toContain("it cannot approve or execute actions");
  expect(workspace).toContain("Business connectors remain simulated");
  expect(workspace).toContain("no live customer updates or real email delivery");
  expect(workspace).toContain("No real money moves");
  expect(workspace).not.toContain("no AI model runs");
  const examples = renderToStaticMarkup(<ControlScopeNote durable={false} />);
  expect(examples).toContain("browser-local sample data");
  expect(examples).toContain("execution traces are simulated");
  expect(examples).not.toContain("AI helps prepare");
});
