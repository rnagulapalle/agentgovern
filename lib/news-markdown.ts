import fs from "fs";
import path from "path";

export type NewsCategory = "governance" | "privacy" | "regulatory";

export type NewsFrontmatter = {
  title: string;
  description: string;
  published: string;
  category: NewsCategory;
  tags: string[];
  relatedGuide?: string;
};

export type NewsPost = {
  slug: string;
  frontmatter: NewsFrontmatter;
  body: string;
};

const NEWS_DIR = path.join(process.cwd(), "content/news");

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    frontmatter[key] = val;
  }
  return { frontmatter, body: match[2].trim() };
}

export function listNewsSlugs(): string[] {
  if (!fs.existsSync(NEWS_DIR)) return [];
  return fs
    .readdirSync(NEWS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .sort((a, b) => b.localeCompare(a));
}

export function loadNewsPost(slug: string): NewsPost | null {
  const file = path.join(NEWS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;

  const raw = fs.readFileSync(file, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  const tags = (frontmatter.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    slug,
    frontmatter: {
      title: frontmatter.title ?? slug,
      description: frontmatter.description ?? "",
      published: frontmatter.published ?? "2026-01-01",
      category: (frontmatter.category as NewsCategory) ?? "governance",
      tags,
      relatedGuide: frontmatter.relatedGuide,
    },
    body,
  };
}

export function listNewsPosts(): NewsPost[] {
  return listNewsSlugs()
    .map((slug) => loadNewsPost(slug))
    .filter((p): p is NewsPost => p !== null);
}

export function newsPath(slug: string) {
  return `/news/${slug}`;
}
