import { buildSeoMetadata } from "@/lib/seo-metadata";
import { Sidebar } from "@/components/agent-governance/Sidebar";

// The demo page.tsx is a client component and can't export metadata, so the
// route's SEO (incl. a self-canonical) is set here on the server layout —
// otherwise it inherits the root layout's canonical "/" and Google folds the
// demo into the homepage instead of indexing it.
export const metadata = buildSeoMetadata({
  title: "Live demo — AI agent action governance",
  description:
    "Interactive control plane: watch an AI agent's actions get intercepted, checked against policy, held for human approval, and sealed in a signed audit receipt.",
  path: "/agent-governance-demo",
  keywords: [
    "AI governance demo",
    "AI agent approval",
    "AI action audit trail",
    "human in the loop AI",
    "AI policy enforcement",
  ],
});

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
