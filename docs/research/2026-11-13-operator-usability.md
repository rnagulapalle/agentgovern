# CRM-to-message operator usability evaluation — November 13, 2026

**Status: complete, for review.**

**Scope label: internal.** One team member played both the requester and the reviewer. This is not an independent operator session and must not be counted as one in growth or commercial evidence (see `2026-10-12-operator-conversion-checklist.md`). Plan: `2026-10-21-operator-usability-evaluation-plan.md`.

## Environment and build

| Item | Value |
|---|---|
| Build | Local install from `codex/linux-developer-setup` at `bde526d` (PR #153, based on main #134) |
| Runtime | Node 22.23.3, pnpm 10.32.1, Next.js 15.5.26, local PostgreSQL 18 created by `pnpm dev:setup` |
| App | `pnpm dev:local`, Workflow runs page at `/control-plane/workflow-runs` |
| Provider twins | `pnpm connectors:twin` (simulated CRM and email) on 127.0.0.1:8018 |
| Accounts | `requester@example.test` (A) and `reviewer@example.test` (B), in two separate browser sessions |
| Agents | CRM-Agent (`twin.crm`) and Messaging-Agent (`twin.email`) |
| Browser | Chromium-based browser, version 157 (from the Lighthouse report) |

**Deviations from the plan**

- Run locally rather than on the hosted workspace, using the local setup in PR #153.
- The local install creates only the CRM connector rule. The email rule was added by hand as the database owner (a copy of the CRM rule) so step 2 could run.
- Screen-reader check removed from scope (evaluator's decision, November 13).
- The FetchSandbox failure checks are only partly possible locally (see Part 5).

## Baseline table (Part 1)

Run `ac4c1bb8`, evaluator already familiar with the flow, so these are practised times, not first-use times. Each step was approved within the 15-minute approval window.

| # | Task | Time | Clicks | Wrong turns | Time source |
|---|---|---|---|---|---|
| T1 | Register the two agents | not timed (registered earlier) | – | – | – |
| T2 | Start the handoff | 6.6 s for T2, T3 and T8 together | 5 (4 agent selections, Start workflow) | 0 | stopwatch total minus saved times |
| T3 | Submit step 1 | (in the 6.6 s above) | 1, after scrolling | 0 | as above |
| T4 | Find and approve step 1 (B) | 7.47 s | 6, after switching window | 0 | saved history |
| T5 | Execute and verify step 1 | 8.48 s | 3 (refresh, Execute, Verify outcome) | 0 | saved history |
| T6 | Submit, approve, execute and verify step 2 | 16.06 s | 12 (step 1's 10, plus 2 reloads) | 0 | saved history |
| T7 | Verify the full run | 5.49 s | 1 | 0 | saved history |
| T8 | Read the exact customer message | (in the 6.6 s above) | 1, after scrolling | 0 | as above |
| | **Whole flow, T2 to T8** | **44.1 s** | | 1 restart (below) | stopwatch, no pauses |

How the times were measured, using two sources:

- **Stopwatch:** the evaluator timed the whole flow, T2 to T8, without pausing: 44.1 s.
- **Saved history:** T4 to T7 come from the run's permanent history. Each is measured from the previous task's last saved event to the task's own last saved event, so it includes switching between the two accounts and reloading.

T2, T3 and T8 leave no saved event of their own, so their combined time is the stopwatch total minus the T4 to T7 times.

Wrong turns: one restart. An earlier attempt (run `c87f61e3`) was submitted and approved, then abandoned, and the timed run was started fresh.

Saved history for run `ac4c1bb8` (A = requester, B = reviewer):

| Time | Step | Event | By |
|---|---|---|---|
| 11:12:57.161 | 1 | held (submitted) | A |
| 11:13:04.632 | 1 | ready (approved) | B |
| 11:13:11.260 | 1 | executing | A |
| 11:13:11.354 | 1 | succeeded (read-back) | A |
| 11:13:13.112 | 1 | succeeded (Verify outcome) | A |
| 11:13:14.737 | 2 | held | A |
| 11:13:23.477 | 2 | ready | B |
| 11:13:29.106 | 2 | executing | A |
| 11:13:29.168 | 2 | succeeded (read-back) | A |
| 11:13:34.624 | 1 | succeeded (Verify the full run) | A |
| 11:13:34.653 | 2 | succeeded (Verify the full run) | A |

**T4 note (how the reviewer finds the request):** there is no notice. The reviewer must know to open Workflow runs and click the run's 8-character ID under "Saved customer handoffs" (F-13), then reload to see the latest state (F-15).

All of T1 to T8 also reached their success signals in an earlier untimed run (`dccd31b5`), including "Acknowledgement verified" and the Verification evidence section.

## Issue log

Severity follows the plan: critical (wrong or unsafe result), major (task blocked or very likely mistake), minor (slows down or confuses), cosmetic. Fix owner follows the plan's fix rules: page wording, layout and accessibility can be fixed in small PRs once Raj confirms; anything in approvals, recovery or the connector path is logged for Raj. Severities and owners are proposed, for Raj to confirm.

| ID | Screen | Steps to reproduce | Expected | Actual | Severity | Type | Fix owner |
|---|---|---|---|---|---|---|---|
| F-01 | Connections | Open Connections with the refund twin not configured | Each working connector shows its status; the missing one shows its own error | Every card stays on "Checking…". The page loads all statuses together and stops if any one fails (`connectors-workspace.tsx`, `Promise.all`) | minor | bug | Aayush, after Raj confirms |
| F-02 | Workflow runs | Open the CRM agent and messaging agent dropdowns; open a step's details | Agents listed by name (CRM-Agent, Messaging-Agent) | Internal IDs shown ("agent-1fbe0201-…"), in the dropdowns and in "Agent:" in step details. The agents API already returns the name (`workflow-workspace.tsx` renders the ID). Code only, not observed: paused agents are not filtered out | major | bug | Aayush, after Raj confirms |
| F-03 | Workflow runs | Start a run | A neutral "not started" headline | "Submission incomplete", text written for a partly failed run (`lib/enquiries/presentation.ts`) | minor | wording | Aayush, after Raj confirms |
| F-04 | Workflow runs | A submits step 1, then looks at the step as A | No approve control for one's own request | "Approve this action" is shown to the requester; the server correctly refuses with "Independent approval by a different operator is required." | minor | bug | Aayush (page only), after Raj confirms |
| F-05 | Workflow runs | Open Technical details before approval | Wording that matches the state | "This is the approved request description" before anything is approved | minor | wording | Aayush, after Raj confirms |
| F-06 | Workflow runs | Trigger any refusal (F2, F3, F5) while scrolled to the step | Message next to the button that failed | One message line at the top of the page, out of view, so the button seems to do nothing. An old message stays after starting a new run | major | layout | Aayush, after Raj confirms |
| F-07 | Workflow runs | Execute a step; click Verify outcome | No extra check offered once the step says "confirmed", or a visible result when clicked | "Verify outcome" offered after "This step's effect is confirmed"; clicking it changes nothing visible | minor | wording | Aayush, after Raj confirms |
| F-08 | Workflow runs | Complete the run | No step actions left | Both steps still show "Verify outcome" | minor | bug | Aayush, after Raj confirms |
| F-09 | Workflow runs | Look at "Saved customer handoffs" | Enough to tell runs apart (date, agents, customer) | Only "dccd31b5 · completed" | minor | layout | Aayush, after Raj confirms |
| F-10 | Workflow runs | Click Verify outcome repeatedly on a confirmed step | One record, or repeat checks marked as such | Each click adds another "succeeded" entry to the permanent history (3 within one second). No duplicate effect | minor | bug | Raj (recovery path; log only) |
| F-11 | Workflow runs | B opens a held step | Approve and Reject | Only "Approve this action". The API supports reject and the page has wording for it, but no button is shown | major | bug | Raj (approvals; log only) |
| F-12 | Workflow runs | Pause the run after step 1 is approved | Execute and Approve hidden or disabled | Still offered; clicking gives "This workflow is paused or completed." The page does show "Paused runs cannot resume in this version." | minor | bug | Aayush, after Raj confirms |
| F-13 | Workflow runs | Open a run, then refresh or sign out and back in | The open run is still shown; reviewers see pending requests | The run disappears from view (kept only in page memory). It must be reopened by clicking its 8-character ID, a button styled like plain text. The reviewer gets no notice of pending requests. Saved state is intact | major | bug | Raj to decide (notice); page part Aayush, after Raj confirms |
| F-14 | Workflow runs | Stop the twin, Execute a step, restart the twin, click Verify outcome | The step can be shown as "not sent" and closed or retried safely | Stays "uncertain" for good: "Outcome evidence unavailable. Do not retry." The twin answers 404 "No effect proven" (correct, it never got the write), but the app treats any non-OK answer as "evidence unavailable". No cancel, close or retry path; the run can never finish | major | bug | Raj (recovery path; log only) |
| F-15 | Workflow runs | A submits; B has the run open (or B approves; A has it open) | The other window shows the new state | Neither window updates until reloaded; the page doesn't check for changes. The evaluator needed refresh or reload clicks in T5 and T6 | minor | bug | Aayush, after Raj confirms |
| F-17 | Workflow runs | B approves step 1; wait 16 minutes; A clicks Execute | The step says the approval expired and offers a way to ask for a new approval | The step turns "cancelled": "This step was cancelled. Earlier steps may still have taken effect." Nobody cancelled it, step 1 has no earlier steps, and "Approved by: reviewer@example.test" is still shown. The real reason ("Authority or approval expired before dispatch.", `lib/connectors/service.ts`) appears only inside the collapsed "Action and verification details". No message appears at the top of the page. The run headline becomes "Work needs a decision", but a cancelled step gets no buttons, so the run can't continue or finish and stays "active" | major | bug | Raj (approvals; log only); wording Aayush, after Raj confirms |
| F-16 | All control-plane pages (sidebar) | Run Lighthouse on Workflow runs | Text contrast at least 4.5:1 | All inactive sidebar labels fail: #726e65 on #f0f0ec is 4.45:1 (`app/control-plane/control-plane.css`, `.cp-nav-item`); 20 elements | minor | accessibility | Aayush, after Raj confirms |

## Failure-path results (Part 2)

| # | Scenario | Result | Run |
|---|---|---|---|
| F1 | Execute step 1 with simulated lost response, then Verify outcome | Passed. Executing 10:11:15, uncertain 10:11:17, resolved to succeeded at 10:20:34 by the reviewer. Only one "executing" event, so no second CRM write. Any member can resolve an uncertain step | `7aa0c256` |
| F2 | While step 1 is uncertain, try to send step 2 | Passed on the server: refused with "A preceding step is unverified or its authority changed. Downstream execution is held." Step 2 went out only after step 1 succeeded. Feedback poor: message out of view (F-06) | `7aa0c256` |
| F3 | Requester approves own request | Passed: refused with "Independent approval by a different operator is required." Message out of view (F-06); button shouldn't be offered (F-04) | `dccd31b5` |
| F4 | Reviewer rejects | Not possible: no Reject button (F-11) | – |
| F5 | Pause mid-run, then try to continue | Passed: no new execution; "This workflow is paused or completed."; page states paused runs can't resume. Controls still offered (F-12) | `28bdc92f` |
| F6 | Reload and sign out/in during a held step | Data passed: state survived and nothing repeated (held 10:43:36, approved 10:43:48). Page lost the open run (F-13) | `8cb19cf0` |
| F7 | Double-click Submit and Execute | Passed: exactly one "held" and one "executing" event; no duplicate effect | `8cb19cf0` |
| F8 | Stop the twin, then execute | First part passed: "Provider response unavailable. No automatic retry."; nothing marked done. After restarting the twin the step can't be resolved (F-14) | `e3b1aa12` |

## Accessibility and phone results (Part 4)

- **Keyboard only (T2–T7):** passed. Every control reachable with Tab, Shift+Tab, Enter and Space; a visible focus outline marks the current element.
- **Phone width (390 px):** passed. Nothing cut off, no sideways scrolling.
- **Automated scan:** Lighthouse 13.5.0, Accessibility, desktop, Workflow runs page as first loaded (before a run is opened): score 96. One failed audit, colour contrast (F-16). 22 passed, 10 manual checks, 40 not applicable.
- **Screen reader:** out of scope (see deviations).

## Heuristic review (Part 3)

Checks from the plan: Is the current state obvious? Is the next action obvious? Is jargon explained? Are errors specific? Is a risky action easy to trigger by mistake? Is it consistent with other pages?

Step status texts (`lib/workflows/request.ts`):

| State | Review |
|---|---|
| Not submitted | Clear, but the run headline says "Submission incomplete" at the same time (F-03) |
| held | "dispatched" is unexplained. Says a reviewer is needed, yet the requester sees "Approve this action" (F-04) and the reviewer gets no notice (F-13) |
| ready | "Current authority is checked again before dispatch" uses two unexplained terms. Doesn't say the approval lasts 15 minutes (set in `lib/connectors/service.ts`; not mentioned on the page). When it expires, clicking Execute turns the step to "cancelled" with no explanation on the step (F-17) |
| executing | "do not repeat the action" is a clear safety line; "Dispatched" is jargon |
| succeeded | Says "confirmed", but Verify outcome is still offered (F-07, F-08) and repeat clicks add history (F-10) |
| uncertain | Says "Verify the external result before any retry", but the page has no retry control, and after a failed check the advice becomes "Do not retry" (F-14). "external result" is unexplained |
| conflict | Says "review it", but the page has no review, cancel or history control. Code only, not observed |
| rejected | Wording exists but can't be reached (F-11) |
| cancelled | Shown after an approval expires (F-17). Says "cancelled" although nobody cancelled, and "Earlier steps may still have taken effect" even on step 1. The page has no cancel control of its own |

Other checks:

- **Errors:** server messages are specific but shown out of view (F-06); "This workflow is paused or completed." doesn't say which (F-12).
- **Jargon:** "provider twins" and "stored provider-twin evidence" in Verification evidence are unexplained for an operator.
- **Risky actions:** double-clicks are safe (F7). "Execute with simulated lost response" sits beside "Execute" in the same style; fine locally, worth labelling as a test control if it ships.
- **Consistency:** agents shown by ID here but by name on the Agents page (F-02); runs identified only by an 8-character ID (F-09, F-13).

## FetchSandbox failure checks (Part 5)

Partly covered. Covered locally: lost response (F1) and provider down (F8).

The local twin (`scripts/connector-twin.py`) can also return 401, 429 and 500 errors, a storage failure and a changed recipient, but only when a request carries the `x-looplabs-proof-fault` header. The app sends only the lost-response header (`lib/connectors/twin.ts`), and nothing else in this build sends the fault header, so these can't be run from the Workflow runs page. Making them reachable would change the connector path, which the plan's fix rules say to log, not change. Whether to make them reachable is for Raj to decide.

**Hosted FetchSandbox.** FetchSandbox can arm failures on a hosted sandbox: its MCP tools `list_scenarios` and `set_scenario` list and arm the failures a spec can inject, and `run_workflow` re-runs a workflow with one armed. The app has an opt-in hosted mode (`LOOPLABS_FETCHSANDBOX_BINDING`, `lib/connectors/hosted.ts`) that leaves fault injection to FetchSandbox ("Arm controlled faults through FetchSandbox; caller headers cannot inject faults."). But in that mode CRM writes are deliberately never sent ("CRM update not supported by this binding… No write was sent; downstream actions stay held."), so step 1 ends uncertain and the email step never runs. No armed FetchSandbox failure can therefore reach this workflow in this version, and no hosted run was made. The scenario names for the HubSpot and email specs were not listed.

No twin defect found: for F-14 the twin's 404 "No effect proven" is a correct answer; the problem is in how the app reads it.

## Recommendations

1. **F-14 and F-17:** give stuck steps a safe way forward. A step sent while the provider was down needs a way to close or retry when the provider proves nothing happened; a step whose approval expired needs to say so and allow a new approval. Today both leave the run unable to finish.
2. **F-11:** add Reject to the reviewer's view; the API and wording already exist.
3. **F-13 and F-15:** remember the open run, update it without reloading, and tell reviewers when a request is waiting.
4. **F-06:** show refusals next to the button that failed, and clear old ones.
5. **F-02:** show agent names instead of IDs.
6. **Wording batch:** F-03, F-05, F-07, F-08, F-12 and the Part 3 jargon.
7. **F-16:** darken the sidebar label colour slightly to reach 4.5:1.
8. **F-01:** load each connector's status on its own, so one missing twin doesn't hide the others.
9. **Part 5:** decide how this workflow should be failure-tested: either make the local twin's other failure modes (401, 429, 500, storage failure, changed recipient) reachable from the page, or support the CRM step in hosted mode so failures armed in FetchSandbox can reach it.

## Fix pull requests

None yet. Fixes will be listed in a separate document after this report.
