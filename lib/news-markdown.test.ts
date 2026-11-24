import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "looplabs-article-dates-"));
  mkdirSync(join(root, "content/news"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true });
});

function article(updated?: string) {
  writeFileSync(join(root, "content/news/example.md"),
    `---\ntitle: "Example"\npublished: "2026-09-30"\n${updated === undefined ? "" : `updated: "${updated}"\n`}---\n\nA supported article.`);
}

it("preserves original publication while exposing a real revision in the sitemap", async () => {
  article("2026-11-24");
  const { loadNewsPost } = await import("./news-markdown");
  expect(loadNewsPost("example")?.frontmatter).toMatchObject({ published: "2026-09-30", updated: "2026-11-24" });
  const { default: sitemap } = await import("../app/sitemap");
  expect(sitemap().find(x => x.url.endsWith("/blog/example"))?.lastModified).toEqual(new Date("2026-11-24"));
  expect(sitemap().find(x => x.url.endsWith("/blog"))?.lastModified).toEqual(new Date("2026-11-24"));
  expect(sitemap().find(x => x.url.endsWith("/platform"))?.lastModified).toEqual(new Date("2026-10-04"));
});

it("surfaces refreshed guidance without changing its original publication date", async () => {
  article("2026-11-24");
  writeFileSync(join(root, "content/news/newer-publication.md"),
    '---\ntitle: "Other"\npublished: "2026-10-20"\n---\n\nOther article.');
  const { listNewsPosts } = await import("./news-markdown");
  expect(listNewsPosts().map(x => x.slug)).toEqual(["example", "newer-publication"]);
  expect(listNewsPosts()[0].frontmatter.published).toBe("2026-09-30");
});

it.each([undefined, "2026-02-30", "not-a-date", "2026-11-24T12:00:00Z", "2026-09-29"])(
  "does not advertise an absent, invalid or pre-publication revision: %s", async updated => {
    article(updated);
    const { loadNewsPost } = await import("./news-markdown");
    expect(loadNewsPost("example")?.frontmatter.updated).toBeUndefined();
    const { default: sitemap } = await import("../app/sitemap");
    expect(sitemap().find(x => x.url.endsWith("/blog/example"))?.lastModified).toEqual(new Date("2026-09-30"));
  },
);
