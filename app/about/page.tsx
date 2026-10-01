import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MarketingFooter, MarketingHeader, marketingPrimaryButton, marketingTextLink } from "@/components/marketing/chrome";
import { buildSeoMetadata } from "@/lib/seo-metadata";
import { SITE } from "@/lib/site";

export const metadata = buildSeoMetadata({
  title: "About LoopLabs",
  description:
    "Meet the founders building LoopLabs and read how we verify product claims, document limitations, and publish guidance about agent workflows and controls.",
  path: "/about",
  keywords: [
    "LoopLabs founders",
    "agent control plane company",
    "agent workflow controls",
  ],
});

const founders = ["Raj Nagulapalle", "Pratibha Sharma"];

function AboutJsonLd() {
  const organizationId = `${SITE.url}/#org`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${SITE.url}/about#page`,
        url: `${SITE.url}/about`,
        name: "About LoopLabs",
        description:
          "The founders, product scope, and publishing standards behind LoopLabs.",
        mainEntity: { "@id": organizationId },
      },
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE.name,
        url: SITE.url,
        email: SITE.email,
        founder: founders.map((name) => ({ "@type": "Person", name })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function AboutPage() {
  return (
    <div className="marketing-surface theme-light">
      <AboutJsonLd />
      <div className="marketing-frame">
        <MarketingHeader section="About" />
        <main className="marketing-main">
          <p className="label">ABOUT LOOPLABS</p>
          <h1 className="marketing-page-title max-w-4xl">
            Build useful agent workflows. Keep people in control.
          </h1>
          <p className="mt-5 max-w-3xl text-[17px] leading-relaxed text-subtle">
            LoopLabs is being built by Raj Nagulapalle and Pratibha Sharma around
            one operating problem: once agents can change real systems, teams need
            a clear way to assign authority, approve risky actions, follow execution,
            inspect outputs, and recover affected state.
          </p>

          <section className="mt-14 grid gap-px border border-hairline/10 bg-hairline/10 md:grid-cols-2" aria-labelledby="founders-title">
            <div className="bg-panel p-7 md:col-span-2">
              <p className="label">FOUNDERS</p>
              <h2 id="founders-title" className="mt-3 text-[24px] font-medium tracking-[-0.035em] text-fg">
                Built with customers, one workflow at a time
              </h2>
            </div>
            {founders.map((name) => (
              <article key={name} className="bg-panel p-7">
                <p className="text-[18px] font-medium text-fg">{name}</p>
                <p className="mt-1 text-[14px] text-subtle">Co-founder, LoopLabs</p>
              </article>
            ))}
          </section>

          <section className="mt-14 max-w-3xl" aria-labelledby="stage-title">
            <p className="label">CURRENT PRODUCT STAGE</p>
            <h2 id="stage-title" className="mt-3 text-[24px] font-medium tracking-[-0.035em] text-fg">
              Early access with guided implementation
            </h2>
            <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-subtle">
              <p>
                The interactive tour demonstrates agent onboarding, scoped access,
                deterministic allow, hold, and block decisions, human approvals,
                run inspection, output checks, and version-aware recovery.
              </p>
              <p>
                It uses prepared sample data in the browser. Model calls, external
                business actions, credential brokering, and production recovery are
                represented rather than connected to a customer system. Early-access
                deployments begin with one real workflow and define the required
                integrations and controls with the customer.
              </p>
            </div>
            <Link href="/control-plane" className={`mt-6 inline-flex ${marketingTextLink}`}>
              Explore the product tour →
            </Link>
          </section>

          <section className="mt-14 max-w-3xl border-t border-hairline/10 pt-12" aria-labelledby="publishing-title">
            <p className="label">HOW WE PUBLISH</p>
            <h2 id="publishing-title" className="mt-3 text-[24px] font-medium tracking-[-0.035em] text-fg">
              Product claims should be inspectable
            </h2>
            <ul className="mt-5 list-disc space-y-3 pl-5 text-[16px] leading-relaxed text-subtle marker:text-faint">
              <li>We connect product claims to a visible demo state or tested behavior.</li>
              <li>We label simulated behavior and current limitations directly.</li>
              <li>We prefer primary sources and first-hand evidence in technical guidance.</li>
              <li>We update or correct material claims when product evidence changes.</li>
              <li>We do not publish invented customers, endorsements, benchmarks, or outcomes.</li>
            </ul>
          </section>

          <section className="card mt-14 p-7" aria-labelledby="contact-title">
            <p className="label">CONTACT</p>
            <h2 id="contact-title" className="mt-3 text-[24px] font-medium tracking-[-0.03em] text-fg">
              Bring us one workflow that matters
            </h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-subtle">
              We will map the agents, people, systems, approvals, failure states,
              and recovery boundary with you.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <a
                href="https://cal.com/rajnagulapalle"
                target="_blank"
                rel="noopener noreferrer"
                className={marketingPrimaryButton}
              >
                Book a founder conversation <ArrowUpRight size={15} />
              </a>
              <a href={`mailto:${SITE.email}`} className={marketingTextLink}>
                {SITE.email}
              </a>
            </div>
          </section>
        </main>
        <MarketingFooter />
      </div>
    </div>
  );
}
