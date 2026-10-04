import type { Metadata } from "next";
import {
  MarketingHeader,
  MarketingFooter,
} from "@/components/marketing/chrome";
import { TeamSignIn } from "@/components/control-plane/access";
import { safeNext } from "@/lib/workspace/navigation";
import "../sales.css";
export const metadata: Metadata = {
  title: "Team sign-in",
  robots: { index: false, follow: false },
};
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="sales-page">
      <MarketingHeader />
      <main className="sales-main sales-grid">
        <section>
          <div className="sales-eyebrow">PRIVATE WORKSPACE</div>
          <h1>Welcome to your control plane.</h1>
          <p>
            Sign in with your invited team account to configure agents, review
            actions and explore recovery.
          </p>
          <p>
            Your workspace currently uses connected sample data and a simulated
            payment provider.
          </p>
        </section>
        <TeamSignIn next={safeNext(next)} />
      </main>
      <MarketingFooter />
    </div>
  );
}
