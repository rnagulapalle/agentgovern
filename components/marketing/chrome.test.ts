import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductOverview } from "./product-overview";

import { MarketingFooter, MarketingHeader, marketingSolutions } from "./chrome";

describe("shared site navigation", () => {
  it("returns visitors home and keeps section destinations valid from nested pages", () => {
    const html = renderToStaticMarkup(createElement(MarketingHeader, { section: "Guides" }));
    expect(html).toContain('href="/"');
    for (const href of ["/#how-it-works", "/#recovery", "/guides", "/blog", "/platform", "/contact-sales"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toMatch(/href="#/);
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("links public visitors to explanations and invited quote access, not disabled feature routes", () => {
    const html = renderToStaticMarkup(createElement(MarketingFooter));
    for (const href of ["/#controls", "/#how-it-works", "/#recovery", "/platform", "/control-plane/quotes", "/sign-in", "/contact-sales"]) expect(html).toContain(`href="${href}"`);
    for (const route of ["agents", "gateway", "approvals", "audit", "policies", "runs", "outputs", "reconciliation"]) expect(html).not.toContain(`href="/control-plane/${route}"`);
    const externalLinks = html.match(/<a[^>]*target="_blank"[^>]*>/g) ?? [];
    expect(externalLinks.length).toBeGreaterThan(0);
    for (const link of externalLinks) expect(link).toContain('rel="noopener noreferrer"');
  });
});


describe("launch social preview claims", () => {
  it("states the prototype scope beside the workflow-control promise", () => {
    const source = readFileSync("app/opengraph-image.tsx", "utf8");
    expect(source).toContain("Explore agent workflow controls.");
    expect(source).toContain("Try approvals and recovery with sample data.");
    expect(source).toContain("Early-stage prototype / Guided implementation");
    expect(source).not.toContain("Control every agent action");
  });
});


describe("coding controls discovery", () => {
  it("adds a public coding controls destination to the shared solutions and footer", () => {
    const item=marketingSolutions.find(item=>item.label==='Coding agent controls');
    expect(item?.href).toBe('/platform#coding-agent-controls');
    expect(item?.description).toContain('demo');
    expect(renderToStaticMarkup(createElement(MarketingFooter))).toContain('href="/platform#coding-agent-controls"');
  });
  it("keeps the public destination explicit about demonstration limits", () => {
    const html=renderToStaticMarkup(createElement(ProductOverview));
    expect(html).toContain('id="coding-agent-controls"');
    expect(html).toContain('CODING AGENT CONTROLS · DEMO');
    expect(html).toContain('do not');
    expect(html).toContain('meter real usage or enforce model access or budgets');
    expect(html).not.toContain('href="/control-plane/coding-agents"');
  });
});
