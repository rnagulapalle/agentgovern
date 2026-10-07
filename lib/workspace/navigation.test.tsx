import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ControlShell } from "../../components/control-plane/shell";
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
  expect(links.some((l) => l.href === "/control-plane/work")).toBe(true);
  expect(links.some((l) => l.href === "/control-plane/verification")).toBe(
    true,
  );
  expect(links.length).toBeGreaterThan(12);
  expect(links.filter((l) => l.prefetch !== false)).toEqual([]);
});
