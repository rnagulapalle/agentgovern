import type { Metadata } from "next";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/chrome";
import { ControlledExportExample } from "@/components/examples/controlled-export";
import copy from "@/lib/marketing-export-example-copy.json";
import "../../landing.css";
import "../../marketing-clarity.css";
import "./example.css";

export const metadata:Metadata={title:copy.example.title,description:copy.example.body,alternates:{canonical:"/examples/controlled-export"},robots:{index:false,follow:true}};
export default function ControlledExportPage() {
  return <div className="ll-landing theme-light clarity-site export-example-page"><a className="ll-skip" href="#main-content">Skip to content</a><div className="ll-frame"><MarketingHeader/><main id="main-content"><ControlledExportExample/></main><MarketingFooter/></div></div>;
}
