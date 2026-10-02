# Mobile readability release — October 2, 2026

## Problem and change

The execution-integrity story used a 2400px-wide raster video on phones. A 22–30px source label becomes roughly 3–5px when displayed at phone width. Increasing CSS text tokens cannot fix embedded raster text.

Phones now show the same eight illustrative stages as reflowing HTML: 18px explanation text, 24px stage headings, 16px record details, and 14px sample-data labels. The story advances every 4.5 seconds only while visible and playing. Previous/next controls pause playback for reading; the shared play control resumes it. Reduced motion suppresses automatic advancement. The desktop video remains unchanged and is paused on phones.

The shared phone typography tokens are 18px body, 16px detail, 14px labels, and 22px subheadings. Older explicit marketing text sizes map to these tokens on phones, including About, Guides, Blog, and article templates. Geist and the current palette remain unchanged. Intervention headings stack rather than squeezing the explanation and link into narrow columns. The mobile pause control is 44px square.

No live connector, permission, approval, or recovery behavior changed. Every story state remains illustrative, with sample-data and no-connected-systems disclosures.

## Comparison and validation

Measured [Runlayer](https://www.runlayer.com/) at a 390px viewport on October 2: hero body 16px, section headings 28px, feature headings 24px, feature descriptions 16px. These are observed sizes, not a copied layout specification.

- Audited 33 sitemap routes plus nine product sections (42 total) at 390px and 320px using the production build. No document overflow; no visible paragraph, label, list item, link, button, record field, or timestamp below 14px at 390px.
- Homepage also checked at 430px and desktop 1440px. Mobile HTML story displayed correctly; desktop retained the video.
- Manual next/previous changed the displayed stage and paused playback. Play resumed automatic progression through subsequent stages.
- Server-render tests verify readable phone text without reliance on video, the initial state, local-sample scope, reading controls, transcript, and recovery link.
- `pnpm quality` passed: 40 tests, coverage thresholds, lint, types, 58 generated pages, and 48 rendered internal destinations.

Viewport checks emulate phone width; they do not substitute for a physical iPhone Safari test.
