import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/chrome";
import { IndustryExamples } from "@/components/examples/industry-examples";
import "../landing.css";
import "../marketing-clarity.css";
import "./industry-examples.css";
export const metadata: Metadata = { title: "Interactive industry workflows", description: "Explore healthcare referral coordination and freight delivery exceptions with action review, policy checks and outcome reconciliation.", alternates: { canonical: "/examples" }, robots: { index: false, follow: true } };
export default function ExamplesPage() { return <div className="ll-landing theme-light clarity-site industry-example-page"><a className="ll-skip" href="#main-content">Skip to content</a><div className="ll-frame"><MarketingHeader/><main id="main-content"><IndustryExamples/></main><MarketingFooter/></div></div>; }
