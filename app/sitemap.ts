import type { MetadataRoute } from "next";
import { AGENTGOVERN_SITEMAP_PATHS } from "@/lib/seo-tools";
import { SITE } from "@/lib/site";

// Static date (per SEO practice — never new Date() on every build). Bump on change.
const UPDATED = new Date("2026-05-27");

export default function sitemap(): MetadataRoute.Sitemap {
  return AGENTGOVERN_SITEMAP_PATHS.map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    lastModified: UPDATED,
    changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: path === "/" ? 1 : path.startsWith("/agent-governance-demo") ? 0.85 : 0.75,
  }));
}
