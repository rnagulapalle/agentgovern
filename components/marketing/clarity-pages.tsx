import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { MarketingHeader, MarketingFooter } from "./chrome";
import { ArchitectureFlow, CapabilityTabs } from "./clarity-experience";
import { ProductScope, CodingControlsScope } from "./public-scope";
import { TeamSection } from "./team-section";
import { WorkflowShowcase } from "./workflow-showcase";
import { DeploymentSection } from "./deployment-section";
import copy from "@/lib/marketing-clarity-copy.json";
import workflow from "@/lib/marketing-tab-workflow-copy.json";
import exampleCopy from "@/lib/marketing-export-example-copy.json";

function Actions({ platform = false }: { platform?: boolean }) {
  return <div className="clarity-actions"><Link className="clarity-primary" href="/contact-sales">{copy.hero.primary}<ArrowUpRight size={17}/></Link><Link className="clarity-secondary" href={platform ? "#workflow-boundaries" : "/examples"}>{platform ? copy.hero.secondary : exampleCopy.diagram.exampleLink}<ArrowRight size={17}/></Link></div>;
}
function Closing() {
  return <section className="clarity-closing" id="demo"><span className="clarity-label">LoopLabs / Early access</span><h2>{copy.cta.title}</h2><p>{copy.cta.body}</p><Actions/></section>;
}
export function ClarityHome() {
  return <div className="ll-landing theme-light clarity-site"><a className="ll-skip" href="#main-content">Skip to content</a><div className="ll-frame"><MarketingHeader/><main id="main-content">
    <section className="clarity-hero"><span className="clarity-label">{copy.hero.eyebrow}</span><h1>{copy.hero.title}</h1><p className="clarity-lead">{copy.hero.body}</p><Actions/><div className="clarity-hero-rule" aria-hidden="true"><span/><i/><span/></div></section>
    <section className="clarity-section clarity-architecture-section" id="how-it-works"><div className="clarity-section-heading"><h2>{copy.architecture.title}</h2><p>{copy.architecture.body}</p></div><ArchitectureFlow/></section>
    <section className="clarity-section" id="controls"><span id="automation" aria-hidden="true"/><span id="recovery" aria-hidden="true"/><div className="clarity-section-heading"><h2>{workflow.title}</h2><p>{workflow.body}</p></div><CapabilityTabs/></section>
    <WorkflowShowcase/>
    <DeploymentSection/>
    <TeamSection/>
    <section className="clarity-section clarity-faq" id="faq"><h2>Good questions.</h2><div>{copy.faq.map(item=><details key={item.q}><summary>{item.q}<span aria-hidden="true">+</span></summary><p>{item.a}</p></details>)}</div></section><Closing/>
  </main><MarketingFooter/></div></div>;
}
export function ClarityPlatform({ quoteOnly=false, scriptDemo=false }: {quoteOnly?:boolean;scriptDemo?:boolean}) {
  return <div className="ll-landing theme-light clarity-site"><a className="ll-skip" href="#main-content">Skip to content</a><div className="ll-frame"><MarketingHeader/><main id="main-content">
    <section className="clarity-hero clarity-platform-hero"><div><span className="clarity-label">{copy.platform.eyebrow}</span><h1>{copy.platform.title}</h1><p className="clarity-lead">{copy.platform.body}</p><Actions platform/></div><ArchitectureFlow/></section>
    <section className="clarity-section clarity-walkthrough"><div className="clarity-section-heading"><h2>{workflow.title}</h2></div><ol>{workflow.items.map((step,i)=><li id={["workflow-boundaries","approved-execution","verified-outcomes","recovery"][i]} key={step.title}><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol></section>
    <section className="clarity-section" id="controls"><div className="clarity-section-heading"><h2>{copy.architecture.title}</h2><p>{workflow.body}</p></div><CapabilityTabs/></section>
    <section className="clarity-section clarity-integration"><div><h2>{copy.platform.integrationTitle}</h2></div><div><p>{copy.platform.integrationBody}</p><Actions platform/></div></section>
    <DeploymentSection/>
    <TeamSection/>
    <section className="clarity-section clarity-available"><div className="clarity-section-heading"><h2>{copy.platform.scopeTitle}</h2><p>{copy.platform.scopeBody}</p></div><div className="clarity-existing-scope"><ProductScope quoteOnly={quoteOnly} scriptDemo={scriptDemo}/><CodingControlsScope/></div></section><Closing/>
  </main><MarketingFooter/></div></div>;
}
