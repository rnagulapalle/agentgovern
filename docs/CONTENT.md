# LoopLabs publishing system

The public content system is file-based. A new Markdown file in `content/news` automatically becomes a blog page, receives article metadata and a social image, and appears in `sitemap.xml`, `feed.xml`, and `llms.txt`.

## Positioning

Every page should make the product understandable in one pass:

1. **Build workflows** — compose one-agent and multi-agent work across approved models and tools.
2. **Control actions** — enforce identity, permissions, policy, and approval before an agent changes a real system.
3. **Recover execution** — observe the complete run, inspect outputs, stop bad work, and reconcile affected state.

Use “agent control plane” as the product category after the plain-language explanation. Use “governance” when discussing a buyer problem, regulation, audit, or an established search term. Do not use “sandbox” as a product name; call the public experience the “interactive product tour” and its sample tenant the “demo workspace.”

## Publish an article

Add `content/news/YYYY-MM-DD-slug.md` with this front matter:

```text
---
title: "A specific, useful title"
description: "One sentence that explains the reader outcome."
published: "YYYY-MM-DD"
category: "governance"
tags: "agent workflows, agent action control"
relatedGuide: "/guides"
---
```

Write for an operator or engineering leader. Start with a concrete failure or workflow. Explain the control and its operational consequence. Avoid broad claims, invented statistics, and generic AI language.

## Search release checklist

- Use one descriptive H1 and a unique title and description.
- Link to a product surface and one related guide.
- Confirm the page appears in `/sitemap.xml`, `/feed.xml`, and `/llms.txt`.
- Check the generated social image at `/blog/<slug>/opengraph-image`.
- After production deploy, submit `/sitemap.xml` in Google Search Console.
