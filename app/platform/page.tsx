import type { Metadata } from "next";
import { quoteDemoProfile, scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
export const dynamic = "force-dynamic";
import { ClarityPlatform } from "@/components/marketing/clarity-pages";
import "../landing.css";
import "../marketing-clarity.css";
import "../sales.css";
export const metadata: Metadata = {
  title: "Agent workflow controls",
  description:
    "Define an agent's boundaries, review actions, and verify uncertain outcomes. Explore LoopLabs' guided approach to one governed workflow.",
  alternates: { canonical: "/platform" },
};
export default function PlatformPage() {
  return <ClarityPlatform quoteOnly={process.env.LOOPLABS_DEPLOYMENT_PROFILE === quoteDemoProfile} scriptDemo={process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile}/>;
}
