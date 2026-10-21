# CRM-to-message internal usability evaluation plan — October 21, 2026

Internal worksheet, not evidence that any session happened. Scope: PRD MVP
#11–13, #15 and #23 on the existing CRM-to-message workflow. A team member plays
both the requester and the reviewer, so this is not an independent operator
session and must not be counted as one in growth or commercial evidence (see
`2026-10-12-operator-conversion-checklist.md`). It produces task timings, a
usability issue list, accessibility results and a bug log, and it prepares a
script that independent sessions can reuse later.

## Questions this evaluation answers

1. Can every task in the workflow be completed, including the failure paths?
2. Where does the page slow a person down or risk a wrong action?
3. Baseline numbers: time per task, clicks, wrong turns. These are the
   "before" numbers for the PRD success metrics.
4. Which defects exist, and which can be fixed within the assignment?

## Decisions (Oct 21)

- Test workflows run on the hosted workspace (approved by Raj).
- For any local run, HubSpot's public Contacts v3 spec is acceptable for manual
  testing (approved by Raj). Tests that pin the reviewed spec fingerprint will
  still fail locally with it; it is never committed.
- Pull requests are opened as drafts early.
- Write actions (start, submit, approve, execute, verify, pause) use the
  evaluator's own named accounts, so every record shows who acted.

## Setup (record in the report)

- [ ] Environment: hosted workspace. Record the release or commit tested.
- [ ] Window A (normal browser): requester account (evaluator's own).
- [ ] Window B (private window): reviewer account. A requester cannot approve
      their own request, so the two roles need two signed-in members.
- [ ] Agents registered under Agents: one CRM agent (tool `twin.crm`) and one
      messaging agent (tool `twin.email`).
- [ ] CRM and email twins running; no error on the page.
- [ ] Screen recording on (optional); timer ready.
- [ ] Browser and screen size noted (for example Chrome, 1920×1080).

## Part 1: happy path, timed

For each task: time from start to the success signal, number of clicks, any
wrong turn, any moment of hesitation, and a screenshot of the end state.

| # | Window | Task | Success signal on screen |
|---|---|---|---|
| T1 | A | Register the CRM and messaging agents (if not already) | Both appear in the agent list |
| T2 | A | Start a customer handoff with the two agents | Run opens; "Customer handoff · Activity" |
| T3 | A | Submit step 1 for approval | "Waiting for an independent reviewer…" |
| T4 | B | Find the request and approve step 1 | Step 1 "Approved for this exact request…" |
| T5 | A | Execute step 1 | Step 1 confirmed after Verify outcome |
| T6 | A + B | Submit, approve, execute and verify step 2 | Step 2 confirmed |
| T7 | A | Verify the full run | Verification evidence shows |
| T8 | A | Before sending, read the exact customer email | "Exact customer message" opens |

Labels on the page: **Start workflow**, **Submit for approval**,
**Approve this action**, **Execute**, **Execute with simulated lost response**,
**Verify outcome**, **Verify the full run**, **Pause workflow**.

Note for T4: record how the reviewer finds the pending request. Is there a
notice, or must the reviewer know where to look and open the run?

## Part 2: failure paths

Run each on a fresh workflow. Record what the screen says and whether the
next safe action is obvious.

| # | Scenario | Expected behaviour (from the code and docs) |
|---|---|---|
| F1 | Execute step 1 **with simulated lost response**, then Verify outcome | Status "The action may have taken effect…"; verify confirms without a second CRM write |
| F2 | While step 1 is uncertain, try to send step 2 | Message stays held |
| F3 | Requester tries to approve their own request (Window A) | Refused; check the wording of the refusal |
| F4 | Reviewer rejects instead of approving (if offered) | "The reviewer rejected this step. It cannot execute." |
| F5 | Pause the workflow mid-run, then try to continue | No new execution; check that the page says paused runs cannot resume |
| F6 | Reload the page and sign out and in during a held step | State survives; nothing is lost or repeated |
| F7 | Double-click buttons (Submit, Execute) quickly | One request only, no duplicate effect |
| F8 | Stop the twin, then try to execute | A clear error; nothing marked as done |

## Part 3: heuristic review

For each screen in the flow, note issues against these checks: Is the current
state obvious? Is the next action obvious? Is jargon explained ("dispatched",
"authority", "external result", "twins")? Are error messages specific? Is a
risky action easy to trigger by mistake? Is it consistent with other pages?

Status messages to review (from `lib/workflows/request.ts`):

| State | Text on screen |
|---|---|
| Not submitted | Not submitted. No action has been sent for review. |
| held | Waiting for an independent reviewer. This step has not been dispatched. |
| ready | Approved for this exact request. Current authority is checked again before dispatch. |
| executing | Dispatched. Its outcome is not confirmed yet; do not repeat the action. |
| succeeded | This step's effect is confirmed. The full run still needs its final check. |
| uncertain | The action may have taken effect. Verify the external result before any retry. |
| conflict | The observed result conflicts with this request. Keep dependent work on hold and review it. |
| rejected | The reviewer rejected this step. It cannot execute. |
| cancelled | This step was cancelled. Earlier steps may still have taken effect. |

## Part 4: accessibility and phone

- Keyboard only: complete T2–T7 without a mouse; note focus order and any
  control that cannot be reached.
- Screen reader (NVDA on Windows): is each status change announced?
- Phone width (390px): do step cards and buttons fit without sideways scrolling?
- Automated accessibility scan of the Workflow runs page.

## Part 5: FetchSandbox failure checks

Using the FetchSandbox MCP connection, list the failure scenarios the twins
can inject and run the relevant ones (for example slow network, rate limiting)
against this workflow. Any twin defect found is fixed in the sandbox repo on
its own branch and pull request, as Raj asked.

## Recording results

**Issue log** (one row per issue):

| ID | Screen | Steps to reproduce | Expected | Actual | Severity | Type | Fix owner |
|---|---|---|---|---|---|---|---|

Severity: **critical** (wrong or unsafe result), **major** (task blocked or
very likely mistake), **minor** (slows down or confuses), **cosmetic**.
Type: bug, wording, layout, accessibility.

**Baseline table:** T1–T8 time (seconds), clicks, wrong turns.

## Fix rules

- Wording, layout and accessibility fixes on these pages: one small pull
  request each, after Raj confirms these components may be changed.
- Authentication, approvals, migrations, Temporal, recovery and deployment
  logic: log the issue, do not change it.
- FetchSandbox twin defects: fix in the sandbox repo, separate pull request.
- Every fix pull request includes a test for the fix and passes `pnpm quality`, which runs once in GitHub CI on the `codex/**` branch.

## Report

`docs/research/YYYY-MM-DD-operator-usability.md`: environment and build,
scope label (internal), baseline table, issue log, failure-path results,
accessibility results, recommendations, links to fix pull requests.
