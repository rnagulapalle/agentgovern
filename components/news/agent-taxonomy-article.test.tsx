import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BlogArticlePage, { generateMetadata } from "@/app/blog/[slug]/page";
import BlogIndexPage from "@/app/blog/page";
import sitemap from "@/app/sitemap";

const slug = "2026-10-20-langchain-langgraph-deep-agents-types";
const path = `/blog/${slug}`;

describe("published agent taxonomy article", () => {
  it("renders its answer, source links, scope limits and matching article schema", async () => {
    const html = renderToStaticMarkup(await BlogArticlePage({ params: Promise.resolve({ slug }) }));
    expect(html).toContain("LangChain vs LangGraph vs Deep Agents: Agent Types Explained");
    expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
    expect(html).toContain("https://docs.langchain.com/oss/python/langchain/agents");
    expect(html).toContain("https://docs.langchain.com/langsmith/python/managed-deep-agents-overview");
    expect(html).toContain("not proof of four independent models or autonomous agents");
    expect(html).toContain("No real money moved");
    expect(html).toContain("not an independently audited benchmark");
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1] ?? "null");
    expect(data[0]).toMatchObject({ "@type": "Article", url: `https://looplabs.run${path}`, datePublished: "2026-10-20", author: { name: "LoopLabs" } });
    expect(data[1]["@type"]).toBe("BreadcrumbList");
    expect(html).not.toContain("Explore the product tour");
    expect(html).toContain('href="/contact-sales"');
  });

  it("is discoverable from the blog and sitemap with a self canonical and social image", async () => {
    expect(renderToStaticMarkup(<BlogIndexPage />)).toContain(`href="${path}"`);
    expect(sitemap().filter((entry) => entry.url === `https://looplabs.run${path}`)).toHaveLength(1);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.openGraph).toMatchObject({ url: `https://looplabs.run${path}`, images: [{ url: `${path}/opengraph-image` }] });
  });

  it("publishes only a sanitized measurement summary with explicit test and attribution limits", () => {
    const raw = readFileSync("public/evidence/2026-10-20-cancellation-agent-attribution.json", "utf8");
    const data = JSON.parse(raw);
    expect(data.cancellation.displayed_steps).toBe(data.cancellation.source_reported_role_labels.length + data.cancellation.generic_actor_steps);
    expect(data.refund_continuation).toMatchObject({ provider_mode: "test", amount_minor: 500, real_money_moved: false });
    expect(data.limitations.join(" ")).toContain("not a cryptographic receipt");
    expect(raw).not.toMatch(/@|CXL-|slack-cxl-|sub_1|ch_3|re_3|342206308838|raj\.jsp|Bearer|secret/i);
  });
});
