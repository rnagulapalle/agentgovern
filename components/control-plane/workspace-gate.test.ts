import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  session: vi.fn(),
  query: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));
vi.mock("@/lib/durable/database", () => ({
  database: () => ({ query: mocks.query }),
}));
vi.mock("@/lib/workspace/identity", async (original) => ({
  ...(await original<typeof import("@/lib/workspace/identity")>()),
  memberSession: mocks.session,
}));
vi.mock("./provider", () => ({
  ControlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./shell", () => ({
  ControlShell: ({
    children,
    member,
  }: {
    children: React.ReactNode;
    member: { name: string };
  }) => createElement("div", null, member.name, children),
}));
import ControlLayout from "@/app/control-plane/layout";
import RequestsPage from "@/app/control-plane/requests/page";
const actor = {
  orgId: "workspace-one",
  subject: "owner@example.com",
  role: "operator",
  tokenHash: "hash",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.mockReturnValue(undefined);
  mocks.session.mockResolvedValue(null);
  mocks.query.mockResolvedValue({ rows: [] });
});
describe("private page boundary", () => {
  it("hides every child workspace behind sales and sign-in when no session exists", async () => {
    const html = renderToStaticMarkup(
      await ControlLayout({
        children: createElement("p", null, "PRIVATE ACTION PAYLOAD"),
      }),
    );
    expect(html).not.toContain("PRIVATE ACTION PAYLOAD");
    expect(html).toContain("Already invited? Sign in");
    expect(html).toContain('href="/contact-sales"');
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("fails closed for invalid sessions, connection failure and revoked members", async () => {
    mocks.cookie.mockReturnValue({ value: "private-session" });
    for (const mode of ["invalid", "offline", "revoked"]) {
      mocks.session.mockReset();
      if (mode === "offline")
        mocks.session.mockRejectedValue(new Error("private database URI"));
      else mocks.session.mockResolvedValue(mode === "revoked" ? actor : null);
      const html = renderToStaticMarkup(
        await ControlLayout({
          children: createElement("p", null, "PRIVATE ACTION PAYLOAD"),
        }),
      );
      expect(html).not.toContain("PRIVATE ACTION PAYLOAD");
      expect(html).not.toContain("private database URI");
      expect(html).toContain("Already invited? Sign in");
    }
  });
  it("reveals the child only to the active named workspace member", async () => {
    mocks.cookie.mockReturnValue({ value: "private-session" });
    mocks.session.mockResolvedValue(actor);
    mocks.query.mockResolvedValue({
      rows: [{ name: "Owner", email: actor.subject }],
    });
    const html = renderToStaticMarkup(
      await ControlLayout({
        children: createElement("p", null, "PRIVATE ACTION PAYLOAD"),
      }),
    );
    expect(html).toContain("PRIVATE ACTION PAYLOAD");
    expect(html).toContain("Owner");
    expect(mocks.query.mock.calls[0][1]).toEqual([actor.orgId, actor.subject]);
  });
  it("prevents server-rendered inquiry disclosure without auth and scopes authorized requests", async () => {
    const denied = renderToStaticMarkup(await RequestsPage());
    expect(denied).not.toContain("Sales requests");
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.cookie.mockReturnValue({ value: "private-session" });
    mocks.session.mockResolvedValue(actor);
    mocks.query.mockResolvedValue({
      rows: [
        {
          name: "Buyer",
          email: "buyer@example.com",
          company: "Company",
          company_size: "201–500",
          role: "COO",
          workflow: "One customer credit",
          created_at: new Date(),
        },
      ],
    });
    const html = renderToStaticMarkup(await RequestsPage());
    expect(html).toContain("One customer credit");
    expect(mocks.query.mock.calls[0][0]).toContain("WHERE org_id=$1");
    expect(mocks.query.mock.calls[0][1]).toEqual([actor.orgId]);
  });
});
