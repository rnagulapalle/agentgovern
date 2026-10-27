import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GuidesPage from "@/app/guides/page";
import BlogArticlePage, { generateMetadata } from "@/app/blog/[slug]/page";
import { SeoPageShell } from "@/components/seo/SeoPageShell";
import { listNewsSlugs, loadNewsPost, newsPath } from "@/lib/news-markdown";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { readFile } from "node:fs/promises";

const slug = "2026-09-30-what-is-an-agent-control-plane";

describe("public guide discovery", () => {
  it("lets crawlers read private-page noindex without listing private URLs in the sitemap", async () => {
    expect(robots().rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/api/"] }]);
    for (const file of ["app/control-plane/layout.tsx", "app/sign-in/page.tsx"]) {
      expect(await readFile(file, "utf8")).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    }
    for (const entry of sitemap()) {
      expect(entry.url).not.toMatch(/\/control-plane(?:[/?]|$)|\/sign-in(?:[/?]|$)|\/api\//);
    }
  });
  it("links to published starting guides with their actual titles and keeps the industry guides", () => {
    const html = renderToStaticMarkup(<GuidesPage />);
    for (const name of [slug, "2026-09-30-agent-permissions-approvals-recovery", "2026-10-20-langchain-langgraph-deep-agents-types"]) {
      expect(listNewsSlugs()).toContain(name);
      expect(html).toContain(`href="${newsPath(name)}"`);
      expect(html).toContain(loadNewsPost(name)!.frontmatter.title);
    }
    expect(html).toContain("Industry guides");
    expect(html).toContain('href="/stale-crm-contact-agent-blocked"');
    expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
  });

  it("keeps default public calls to action out of the private workspace", () => {
    for (const html of [
      renderToStaticMarkup(<GuidesPage />),
      renderToStaticMarkup(<SeoPageShell eyebrow="Guide" title="Guide" description="Example">Content</SeoPageShell>),
    ]) {
      expect(html).toContain('href="/platform"');
      expect(html).not.toContain('href="/control-plane"');
      expect(html).not.toContain("Explore the product tour");
    }
  });

  it("preserves the category URL and canonical while linking the article to a public overview", async () => {
    const html = renderToStaticMarkup(await BlogArticlePage({ params: Promise.resolve({ slug }) }));
    expect(html).toContain('href="/platform"');
    expect(html).not.toContain('href="/control-plane"');
    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(metadata.alternates?.canonical).toBe(newsPath(slug));
    expect(sitemap().filter((entry) => entry.url === `https://looplabs.run${newsPath(slug)}`)).toHaveLength(1);
  });
});
