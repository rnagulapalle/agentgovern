import type { Metadata } from "next";
import Link from "next/link";
import {
  MarketingHeader,
  MarketingFooter,
} from "@/components/marketing/chrome";
import { SalesForm } from "@/components/marketing/sales-form";
import "../sales.css";
export const metadata: Metadata = {
  title: "Talk to LoopLabs",
  description:
    "Bring one agent workflow. Map its actions, approvals and failure cases with the LoopLabs founders.",
  alternates: { canonical: "/contact-sales" },
};
export default function ContactSales() {
  return (
    <div className="sales-page">
      <MarketingHeader />
      <main className="sales-main sales-grid">
        <section>
          <div className="sales-eyebrow">TALK TO THE FOUNDERS</div>
          <h1>
            Bring one workflow.
            <br />
            We’ll map the controls.
          </h1>
          <p>
            Show us a process that changes a record, sends a customer message,
            or handles an exception. We’ll work through who owns it, what the
            agent can do, and what happens when a result is unclear.
          </p>
          <p>
            We’ll agree a bounded pilot if there is a fit. The current workspace
            uses sample discount data and a simulated payment provider.
          </p>
          <p>
            Prefer to book directly?{" "}
            <a
              className="sales-link"
              href="https://cal.com/rajnagulapalle"
              target="_blank"
              rel="noopener noreferrer"
            >
              Choose a time ↗
            </a>
          </p>
          <p>
            Already invited?{" "}
            <Link className="sales-link" href="/sign-in">
              Team sign-in
            </Link>
          </p>
        </section>
        <SalesForm />
      </main>
      <MarketingFooter />
    </div>
  );
}
