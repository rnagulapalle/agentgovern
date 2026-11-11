import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeDollarSign, ContactRound, ReceiptText, ShieldCheck, SearchCheck } from "lucide-react";
import copy from "@/lib/marketing-workflows-copy.json";

const workflowIcons = [BadgeDollarSign, ContactRound, ReceiptText];
export function WorkflowShowcase() {
  return <section className="clarity-section clarity-showcase" id="proof" aria-labelledby="workflow-showcase-title">
    <div className="clarity-showcase-heading"><div><span className="clarity-label">{copy.eyebrow}</span><h2 id="workflow-showcase-title">{copy.title}</h2></div><p>{copy.body}</p></div>
    <div className="clarity-workflow-cards">{copy.workflows.map((workflow,index)=>{
      const Icon=workflowIcons[index];
      return <article key={workflow.title}>
        <div className="clarity-workflow-path" aria-hidden="true"><span><Icon/></span><ArrowRight/><span className="workflow-control"><ShieldCheck/></span><ArrowRight/><span><SearchCheck/></span></div>
        <h3>{workflow.title}</h3><p>{workflow.body}</p>
      </article>;
    })}</div>
    <div className="clarity-showcase-footer"><p>{copy.note}</p><Link className="clarity-secondary" href="/platform#verified-outcomes">{copy.link}<ArrowUpRight size={18}/></Link></div>
  </section>;
}
