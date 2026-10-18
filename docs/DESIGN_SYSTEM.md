# Shared site design

Public pages use `MarketingHeader` and `MarketingFooter`, Geist, and the shared tokens in `app/globals.css`. The landing page, guides, articles, and about page must use the same navigation destinations and mobile menu.

Typography roles: body 16px, supporting detail 14px, short labels 12px, subheadings 20px, section headings 24px. Large page titles remain responsive. Never shrink explanatory text to fit a card; let the card grow or reflow. Diagrams also need readable labels. The company administrator workspace uses its larger reading scale below.

Use warm neutral surfaces, dark ink, and the shared muted text color. Status colors must remain distinguishable and retain contrast. Keep primary actions at least 44px high and provide visible keyboard focus. The product workspace can have denser layout while sharing the font and typography roles.

Before release, inspect public page families and product routes at desktop and mobile widths. Check navigation, section anchors from nested pages, document overflow, diagram labels, disclosures, tables, and dialogs. Preserve sample-data disclosures and the distinction between the prototype and planned production capabilities.

## Company administrator workspace

The shared `.cp-app.cc-brand-system` scale in
`components/control-plane/control-center.css` applies to every administrator route,
including Connections, AWS observation setup and context drawers. Keep Geist,
charcoal primary buttons with white labels, warm neutral surfaces and the shared
status colors. Do not introduce smaller page-specific fonts for dense tables.

- Page title: 32px desktop, 28px mobile.
- Dialog title: 24px; section heading: 22px; subsection heading: 18px.
- Primary content, row titles, navigation, forms and buttons: 16px.
- Supporting details, timestamps, status text and field labels: 14px.
- Actions and form controls: at least 44px high.

Use the shared `--text-body`, `--text-label`, `--text-subheading` and
`--cp-type-title` tokens. Rows and filters must reflow at 390px without horizontal
overflow; allow longer labels to wrap rather than reducing their font size.
The mounted seven-page check measures title, navigation and action sizes at both
widths, with additional Activity row and timeline checks. This is presentation
verification, not workflow execution or provider acceptance.
