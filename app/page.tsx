import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import copy from "@/lib/marketing-clarity-copy.json";
import { ClarityHome } from "@/components/marketing/clarity-pages";
import "./landing.css";
import "./marketing-clarity.css";
export const metadata: Metadata = { title: { absolute: SITE.title }, description: SITE.description, alternates: { canonical: "/" } };
function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        featureList: [
          "Agent identity and permissions",
          "Action controls",
          "Execution controls",
          "Output controls",
          "State recovery",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: SITE.url,
        email: SITE.email,
        founder: [
          { "@type": "Person", name: "Raj Nagulapalle" },
          { "@type": "Person", name: "Pratibha Sharma" },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.name,
        url: SITE.url,
        publisher: { "@id": `${SITE.url}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: copy.faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
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


export default function LandingPage() { return <><JsonLd/><ClarityHome/></>; }
