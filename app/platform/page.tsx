import type { Metadata } from "next";
import {
  MarketingHeader,
  MarketingFooter,
} from "@/components/marketing/chrome";
import { ProductOverview } from "@/components/marketing/product-overview";
import "../sales.css";
export const metadata: Metadata = {
  title: "Agent workflow controls",
  description:
    "Define an agent's boundaries, review actions, and verify uncertain outcomes. Explore LoopLabs' guided approach to one governed workflow.",
  alternates: { canonical: "/platform" },
};
export default function PlatformPage() {
  return (
    <div className="sales-page">
      <MarketingHeader />
      <ProductOverview />
      <MarketingFooter />
    </div>
  );
}
