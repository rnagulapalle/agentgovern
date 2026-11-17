# Marketing clarity: homepage and platform

User scope: both public pages; preserve LoopLabs colors, mark, Geist and existing navigation. Reference reviewed in authenticated Chrome: https://www.arcade.dev/ and https://www.arcade.dev/product/ on November11,2026. No reference assets or brand artwork reused.

## Existing owner and reproduced gap

Owner: app/page.tsx and app/platform/page.tsx. Shared modules: components/marketing/chrome.tsx, components/marketing/product-overview.tsx, components/landing/experience.tsx, lib/site.ts. Existing public anchors and invitation/auth boundaries must remain. ProductOverview is also used by gated workspace routes and must not be replaced there. No engine, connector, approval, registry or telemetry changes.

Observed current homepage: two competing hero explanations, seven illustration stages, repeated identity/control/recovery sections and a large illustrative metrics dashboard before the final CTA. Platform is largely text and does not visually continue the homepage story. Gap: comprehension and pacing, not missing engine capability. Reuse shared header/footer, SITE and existing routes; smallest extension is one shared public narrative with an explicit architecture and four capability states. Existing gated ProductOverview remains intact.

## Reference section audit and adaptation

| Reference section | Communication job and interaction | LoopLabs adaptation |
|---|---|---|
| Announcement | One current announcement, small type, contrasting badge | Omit until a meaningful verified announcement exists |
| Navigation | Persistent navigation; product/pricing/build/resources segmentation; same demo CTA | Keep shared LoopLabs navigation and real destinations |
| Hero | One broad outcome, one mechanism paragraph, dominant action and secondary sales action; moving color field behind stable text | One short outcome and one paragraph, existing guided workflow CTA and product walkthrough; warm paper/charcoal/olive geometry |
| Compatibility row | Tool logos answer where it fits | Use generic agent/person/system labels; no unverified compatibility logos |
| Customer strip | Early credibility before detailed explanation | Use bounded proof scope, no invented endorsements |
| Problem section | Three specific alternatives and their consequences; split layout and highlighted active row | Three concrete workflow failure moments, readable without animation |
| Architecture | Agents left, runtime center, systems right; pulses make direction legible | Original vector composition: agents/people, LoopLabs, systems; separate outcome return line and scope note |
| Feature sequence | Four verbs; pinned viewport, progress line, click tabs and scroll progression; one short explanation paired with one visualization | Four explicit keyboard-accessible tabs; normal scrolling, no forced pinned sequence; active decision visual and independent motion pause |
| Security/deployment/team | Separate purchase objections with specific evidence and generous alternating blocks | Current bounded proof and clear integration discovery requirements; no SOC2/SSO/universal deployment claims |
| Testimonials | Actual named customers and use cases; moving cards with direct selection | Omit until permissioned customer evidence exists; use an inspectable product walkthrough |
| Where next | Three paths based on visitor intent | Public explanation or bring one workflow; no nonexistent self-service/pricing paths |
| FAQ | Progressive disclosure for detailed objections | Three material questions; native details accessible without JavaScript |
| Closing CTA/footer | Restates core promise and repeats the same conversion action | Same guided CTA throughout, existing footer and contact route |
| Product hero | Same visual language; expands mechanism instead of repeating homepage | Shared visual system, distinct numbered process |
| Product before/after/benefits | Establish change and reasons to adopt before implementation detail | Concrete review/execution/verification sequence; no unmeasured speed or ROI claims |
| Under the hood | Three capability groups, nested details and diagrams | Reuse four capability components plus scoped implementation section |
| Catalog/deployment/getting started | Coverage, operating model and entry path | Explicitly discuss systems and permissions with founders; no broad connector catalog |

## Motion and UX observations

Desktop tested: hero, problem, architecture, feature tab selection and scroll progression, trust, testimonial, next-step cards, FAQ structure and product structure. Five video elements expose autoplay/loop/muted. One AX media element reported unable to play media; not all videos are verified playable. Feature selection visually advanced after click and subsequent scroll. Motion observation is qualitative, no timing/CPU/accessibility certification. Reference mobile behavior is not yet evaluated.

Apply: motion should demonstrate direction/state, not imply live execution. Text must remain stable. Original SVG/CSS only; no copied assets. Pause motion; honor prefers-reduced-motion; no timed tab changes, no scroll hijacking; all content reachable by keyboard and on narrow screens. A held branch must never animate as dispatched. A verification loop must be distinct from a new write.

## Acceptance and limits

Check both routes at desktop/mobile, same existing anchors, correct local links, CTA destinations, keyboard tabs (arrows/Home/End), focus, pause, reduced motion, no horizontal overflow and visible scope. Preserve profile-specific platform scope and gated components. Public prose generated with saved MyVoice and exact storage receipt; render returned strings unchanged. Claim checks reject self-service/live-provider/zero-error implications. Full repository quality remains separate from focused presentation checks and browser acceptance. No deployment until release gates pass. No effect on private engine acceptance or analytics proof repair.

## Copy and guard update

Strict RawReply first attempt failed and is retained privately; same-chat revision passed saved MyVoice revision3,3 candidates, independent judge/audit and exact storage readback. lib/marketing-clarity-copy.json contains the exact returned JSON bytes. Existing UI labels and deployment-profile scope are retained verbatim. Public profile-scope rendering is copied rather than refactoring ProductOverview so private installed proof source closures remain unchanged; parity test compares actual rendered legacy scope for each profile.

Initial repository gate failed because it demanded two retired source literals in app/page.tsx: Control actions, and uses sample browser data. The new page removes the browser-local statistics panel entirely. The guard now checks the actual shared copy file for the control category and explicit non-live disclosure; the rendered-copy test confirms those strings reach the page. Unsupported-claim scanning now also includes untracked source and this new JSON copy file; no forbidden patterns were removed.

## Observed preview acceptance

Actual Next.js preview uses existing owned TLS fixture and normal tenant bootstrap; no instrumentation/auth bypass. Chrome verified desktop1554px and mobile354px; mobile document scrollWidth346px, one h1 on each route, mobile menu navigation and Recover selection. End selects Recover, ArrowRight wraps to Define, Home returns Define, pause becomes aria-pressed true. Browser viewport changes took a fresh tab/navigation before becoming visible; earlier screenshots were not mobile proof. Temporary iframe preview was blank and removed without changing security headers. Desktop viewport restored by resetting override and opening a fresh tab.

11 focused tests passed across2files including exact existing profile-scope parity; TypeScript and focused lint passed. Full quality first refused retired copy literals; corrected guards retain non-live disclosure and broaden unsupported claim scanning to new JSON. Subsequent full quality currently has database/private-fixture prerequisite failures and is not accepted. No commit, PR or deployment. Presentation preview does not establish private native-agent or production reliability acceptance.

Final quality result: exit1;85files failed/300passed,302tests failed/2861passed/398skipped. Missing database installations and authenticated compiled/private artifacts appear in errors. No failure/skip is counted as a pass. Separate pnpm build exited0. No full-suite equivalence, merge or release acceptance. First owned preview cleaned all resources and restored SQL inventory; final separately owned review preview remains available locally.

## Icon architecture revision

User requested the reference-style left/right icon groups in LoopLabs branding. Reused ArchitectureFlow on both routes. Left: MCPclients,models,frameworks (9 displayed marks). Right:20 business-system marks.28distinct SVG path sets are bundled locally from SimpleIcons; source URLs, exact hashes and CC0text retained in public/brand-licenses. Center retains LoopMark, olive gradient, four stages, two animated rings and pulse paths. Original illustrative/scoped-connection disclosure remains verbatim; no connector support or endorsement inferred.12focused tests across2files, focusedESLint and TypeScript passed. Desktop homepage/platform observed and pause confirmed true. Current revision not committed/deployed; prior full-quality prerequisites still unresolved. Previous production build receipt belongs to the pre-icon revision; current icon build not run.

Native-color revision:28palette entries,7locally bundled multicolor assets, normalized optical sizing. OpenAI remains monochrome per official brand guide. SVG metadata cleanup retains safe local fragment references; Google was visually checked after fixing its clipPath reference.12focused tests,TypeScript,ESLint passed; screenshot and private receipt retained. No prose change, commit or deployment. Current color revision production build/full quality remain unaccepted.

Animation revision: each public capability tab now has an original CSS/SVG mechanism illustration, subdued moving frame, independent pause control and native brand marks. Define: scoped identity; Approve: held request and human review; Verify: read-back loop with held dependent message; Recover: versioned proposal. Held/proposed paths have no dispatch-packet class; semantic assertions cover these boundaries.14focused tests passed; TypeScript passed; unused import warning corrected and finalESLint passed. Chrome observed stroke-dashoffset changing while running and paused computed state; End selects Recover. No actual effects, new engine owner, commit or deployment. Current animation production build/full quality, OS reduced-motion emulation and mobile visual acceptance remain unmeasured.

Placement refinement: user rejected lengthy hero and architecture caveats. Both blocks removed. Architecture footer uses exact strict MyVoicev3 returned service statement; no new shipped integration claim. Current proof scope and deployment-specific platform availability remain visible; rendered tests retain these limits. Repository disclosure guard now follows visible proof delivery limits rather than an unused hero-scope string.14focused tests,types,lint,repository gate passed. Local Chrome verified removed strings absent and current limits retained. No deployment.

Scroll-driven chapter revision at user request: desktop sequence pins tabs/visual below the actual shared header and maps ordinary page position to four chapters. Four chapter-length runway holds finalRecover before releasing to following section. Reverse scrolling reverses selection. Manualclick and keyboard selection reposition to the matching chapter; focus is only moved for keyboard actions. Passive scroll listener/requestAnimationFrame and ResizeObserver are cleaned up. No wheelpreventDefault. Manual fallback applies to narrow/short/reduced-motion views or when the panel does not fit.17focused tests,TypeScript,lint passed. Native Chrome confirmed all4forward,reverse,naturalexit,directclick,keyboardEnd onhome, plus autoApprove andstickyposition onplatform. Reduced-motion OS emulation not performed. No commit/deployment; current productionbuild/fullquality unrun.

### Deployment section
Added shared deployment section to homepage and platform with olive cloud/control/data visual. Exact RawReply approved copy from turn 2563208268f94c2ca2ac92cd936da61c, saved MyVoice revision 3, three candidates. Copy frames deployment/access/data handling as decisions agreed with the team, without advertising unproved on-prem, air-gapped or hybrid production support. Platform current-scope disclosures remain visible.
Validation: 13 focused tests across two files passed; TypeScript and targeted ESLint exit 0. Local Chrome rendered both routes; screenshot deployment-preview.png in private evidence directory. Current production build/full quality not rerun; previous full quality remains failed on unavailable dedicated fixtures. Not committed or deployed.

### Team experience section
Added shared split team section after deployment on both public routes, using Meta and WhatsApp native-color vector marks. Experience fact supplied directly by Raj on November 11: team worked on privacy, compliance and governance at Meta Ads and WhatsApp Business. Does not claim company endorsement, customers, leadership roles or comprehensive resolution. Exact RawReply copy turn 37a15204b7424d4189e6f08939c721c8; saved MyVoice v3, three candidates, claude-opus-5-5. Local homepage browser screenshot team-preview.png. 14 focused tests, TypeScript, targeted ESLint and diff whitespace check passed. Current build/full quality unrun; earlier full quality fixture blockers remain. No commit or deployment.

### Remove duplicated recovery section
Removed homepage standalone recovery explanation and reused RecoveryDiagram because Recover is already one of the four animated tabs. Removed unused presentation styles/import only; original landing diagram module untouched. Existing /#recovery navigation target now resolves within the four-tab section. Platform walkthrough unchanged. Deployment remains on user hold.

### Workflow showcase replaces generic proof checklist
Replaced the homepage one-quote/test-setup panel with three business scenarios: scoped discount to checked quote, approved CRM update to dependent acknowledgement, and refund limits with lost-response reconciliation. Uses existing documented contracts in REFUND_AGENT_PROOF.md, CONNECTOR_VERIFICATION.md and SCOPED_CHAT_EXPERIENCE.md; no new execution or provider claims. One visible note retains sample/provider-twin scope and no real money/email. Platform current-scope section unchanged. New exact RawReply copy in marketing-workflows-copy.json; initial output held after factual review incorrectly generalized mandatory approval to all refunds, revised in same chat. Final turn b1d8df5e1463435ca8365e24bd936de2, MyVoice v3, three variants, claude-opus-5-5; copy retained verbatim. Guard now checks rendered showcase disclosure source and scans all marketing JSON. 15 focused tests/2 files, TypeScript, targeted ESLint, repository gate and diff check passed. Local Chrome read-back confirmed three cards and exact note. Screenshot workflows-preview.png. Full quality/build not rerun; deployment remains on user hold.

### Deployment architecture and enterprise requirements
Replaced three generic icons with a shared layered deployment blueprint: named review/exact-action approval, scoped agent identities, AWS-labelled workflow runtime containing LoopLabs policy checks, scoped business-system connections, action history and outcome verification. Animated SVG paths and review line; pause/resume and reduced-motion CSS. No live system state, new permissions, provider calls, certification/HA/SLA or enterprise acceptance claims. Exact RawReply copy turn 972f5adfb7684140b0d645d6b57693fb, MyVoice v3, three variants, claude-opus-5-5. Initial focused/type check rejected wrong AWS icon key; corrected to existing amazonwebservices key and reran. Final: 15 tests/2 files, TypeScript, targeted lint, repo gate and diff check passed. Chrome observed animation running and paused, aria-pressed true, then resumed. Screenshot enterprise-deployment-preview.png. Current full quality/build unrun, deployment remains held by user.
