import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generateMetadata } from "@/app/blog/[slug]/page";
import { GET as feed } from "@/app/feed.xml/route";
import { GET as aiIndex } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";
import { loadNewsPost, newsPath } from "@/lib/news-markdown";
import { NewsMarkdownBody } from "./NewsArticle";

const slug = "2026-10-02-ai-crm-workflow-pilot";
const url = `https://looplabs.run${newsPath(slug)}`;

describe("CRM pilot discovery and product truth", () => {
  it("publishes one canonical article with its own social image and discovery entries", async () => {
    const post = loadNewsPost(slug);
    expect(post).not.toBeNull();
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.alternates?.canonical).toBe(newsPath(slug));
    expect(metadata.openGraph).toMatchObject({ url, images: [{ url: `${newsPath(slug)}/opengraph-image` }] });
    expect(sitemap()).toContainEqual(expect.objectContaining({ url, lastModified: new Date(post!.frontmatter.published) }));
    const rss = await feed().text();
    expect(rss).toContain(`<guid isPermaLink="true">${url}</guid>`);
    expect(rss).toContain(`<lastBuildDate>${new Date(`${post!.frontmatter.published}T12:00:00Z`).toUTCString()}</lastBuildDate>`);
    expect(await aiIndex().text()).toContain(url);
  });

  it("keeps pilot acceptance criteria separate from shipped capabilities", () => {
    const html = renderToStaticMarkup(createElement(NewsMarkdownBody, { body: loadNewsPost(slug)!.body }));
    expect(html).toContain("These are proposed pilot acceptance criteria");
    expect(html).toContain("The demos do not connect to your CRM");
    expect(html).toContain("There is no self-service visual workflow builder today");
    for (const failure of ["Missing authority", "Changed approval", "Lost response", "Repeated attempt", "Concurrent edit", "Unresolved outcome"]) {
      expect(html).toContain(failure);
    }
    for (const href of ["/control-plane", "/control-plane/reconciliation", "/control-plane/workflows", "/#demo"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not invent article metadata or content for an unknown slug", async () => {
    const missing = "nonexistent-crm-pilot";
    expect(loadNewsPost(missing)).toBeNull();
    expect(await generateMetadata({ params: Promise.resolve({ slug: missing }) })).toEqual({});
    expect(sitemap().some((entry) => entry.url.endsWith(missing))).toBe(false);
  });

  it("tells AI readers that integrations and production guarantees remain unshipped", async () => {
    const text = await aiIndex().text();
    expect(text).toContain("deterministic browser-local simulations");
    expect(text).toContain("It does not connect to production business systems");
    expect(text).not.toContain("LoopLabs is the workflow and control layer for teams running AI agents in production.");
  });
});
