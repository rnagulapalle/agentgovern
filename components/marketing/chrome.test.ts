import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketingFooter, MarketingHeader } from "./chrome";

describe("shared site navigation", () => {
  it("returns visitors home and keeps section destinations valid from nested pages", () => {
    const html = renderToStaticMarkup(createElement(MarketingHeader, { section: "Guides" }));
    expect(html).toContain('href="/"');
    for (const href of ["/#how-it-works", "/#recovery", "/guides", "/blog", "/control-plane"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toMatch(/href="#/);
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("preserves product destinations and secures links that open another window", () => {
    const html = renderToStaticMarkup(createElement(MarketingFooter));
    for (const route of ["agents", "gateway", "approvals", "audit", "policies", "runs", "outputs", "reconciliation"]) {
      expect(html).toContain(`href="/control-plane/${route}"`);
    }
    const externalLinks = html.match(/<a[^>]*target="_blank"[^>]*>/g) ?? [];
    expect(externalLinks.length).toBeGreaterThan(0);
    for (const link of externalLinks) expect(link).toContain('rel="noopener noreferrer"');
  });
});
