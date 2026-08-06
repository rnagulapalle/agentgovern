import type { MetadataRoute } from "next";
import { AGENTGOVERN_SITEMAP_PATHS } from "@/lib/seo-tools";
import { listNewsPosts, newsPath } from "@/lib/news-markdown";
import { SITE } from "@/lib/site";

// Static date (per SEO practice — never new Date() on every build). Bump on change.
const UPDATED = new Date("2026-08-06");

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = AGENTGOVERN_SITEMAP_PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: UPDATED,
    changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : path.startsWith("/agent-governance-demo") ? 0.85 : 0.75,
  }));

  // News articles are content-driven: enumerate from the markdown files so the
  // sitemap stays in sync as posts ship (no need to hardcode slugs here).
  const articles: MetadataRoute.Sitemap = listNewsPosts().map((post) => ({
    url: `${SITE.url}${newsPath(post.slug)}`,
    lastModified: new Date(post.frontmatter.published),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...pages, ...articles];
}
