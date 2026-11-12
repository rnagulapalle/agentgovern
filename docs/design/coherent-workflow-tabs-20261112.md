# One workflow across four capability tabs

User request: rename Recover to Reconcile and use one relatable, already demonstrated workflow across Define, Approve, Verify and Reconcile on both public pages.

Owner: existing CapabilityTabs and CapabilityAnimation; presentation only. Existing four-stage scroll mapping, keyboard navigation, motion pause and reduced-motion fallbacks remain. No workflow runner, approval authority, connector or telemetry changes. Reuse existing CRM-to-acknowledgement fixed graph. Gap reproduced in source: discount approval, CRM verification and Net 90-to-Net 30 compensation were three unrelated examples within one narrative.

Proof basis: SCOPED_CHAT_EXPERIENCE.md and WORKFLOW_ONBOARDING_PROOF.md describe exact independent approvals, verified CRM-to-email dependency, and lost CRM response reconciled by readback without duplicate effects. The example uses a fictional customer identifier and Sarah Chen as a sample manager. It is an illustrative private-provider-twin workflow, not a new live customer integration or production acceptance receipt.

Smallest extension: replace only capability narrative and stage-specific illustrations, retaining shared components, local brand assets, existing deep-link IDs (including legacy recovery), and deployment-specific scope. Reconciliation reads existing state; it does not restore payment terms or assume an uncertain operation failed. Unknown/conflicting outcomes remain held. Decorative packet motion stays on review/readback paths, never on held effect paths.

Acceptance: focused shared page and stage rendering checks, types/lint, full repository quality, local desktop/mobile visual checks, keyboard/scroll/pause/reduced-motion behavior. Deployment remains separate and requires normal clean pushed-main CI and release checks. Private execution acceptance is outside this presentation-only change.
