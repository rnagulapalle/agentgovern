# Current saved-workflow proof engagement

Candidate for existing issue 156, November 5, 2026. This is measurement of a
permitted read, not a new workflow/execution owner, independent effect proof,
customer qualification or a booked call. No production ingestion is established
by source or component tests.

## Existing boundary

`/control-plane/workflow-runs` renders `WorkflowWorkspace`. Selecting a saved
handoff performs the existing GET and displays its saved result. The explicit
selection now calls the existing analytics utility with a fixed category and the
same two-action receipt classification already used by `runProgress`:

- `proof_kind`: `crm_to_message_private_twin`.
- `verification_state`: `verified` or `not_verified`, describing the saved UI
  receipt only. It does not recheck a provider or current execution permission.

A failed request, wrong run ID, unknown state, malformed pair, duplicate action ID
or unsupported connector produces no event. Merely loading the page, an embedded
view, creating a run or refreshing after an action does not count as this explicit
view. Reopening the same run deduplicates within this component mount; reload or
remount starts a new view session. This is not a unique-buyer count. A temporary
SDK failure is contained and is not automatically retried.

## Privacy boundary

The private shell retains `ph-no-capture` and `data-private`. No run/action/agent,
company, record, recipient, message, payload or provider reference is passed to
capture. The run ID stays only in a component-memory set.

The existing SDK's `before_send` hook separately allowlists this event's final
properties: the existing configured public project token, the two category fields, an opaque anonymous `distinct_id`, optional
opaque device/session/window IDs, existing `$is_test: true`, and
`$process_person_profile: false`. Only SDK event name, UUID and valid timestamp
are retained outside properties. URL/referrer/acquisition context, arbitrary
super-properties and top-level `$set`/`$set_once` are discarded for this event.
Email-shaped identified distinct IDs or unsupported schemas drop the event.
Other analytics events retain their current behavior. This is a narrow event
filter, not a claim that all existing analytics are free of sensitive data.

PostHog documents this final redaction hook at
https://posthog.com/docs/libraries/js/usage#redacting-information-in-events .
The actual SDK fixture reaches the final hook, verifies its public ingestion token
and QA flag, then returns null; all external requests are blocked. The fixture
only disables SDK bot filtering locally so headless processing reaches that hook.
No SDK production/bot-filter setting is changed. The hook still needs deployed/native observation; fixture-level serialization is
not production SDK ingestion acceptance.

## Separate acceptance

The existing component test file exercises an explicit permitted saved read,
initial/repeated views, denied HTTP and a wrong-run response. It uses a capture
observer and no provider calls. Analytics tests separately exercise classification,
malformed data, dedup, SDK failure and the final property filter with injected
private context. These are separate checks, not one native proof receipt.

Normal exact-source CI and release gates remain required. After release, use one
existing authorized saved run and labeled QA session to inspect one read-only
view, its sanitized received event and its exclusion from growth reporting. Do
not execute/replay a workflow, change grants or disable privacy masking to obtain
that receipt. Update the existing measurement insight only after native acceptance;
keep the legacy simulated-tour definition and raw historical events intact.
Confirmed bookings, attendance and independent operator qualification remain
unavailable until supported by their own records.

## CI prerequisite recovery

The first candidate CI run 42006189225 failed before the full quality suite:
runner-default Python 3.14 exceeded the retained pydantic-core/PyO3 supported
maximum of 3.13. The existing connector fixture Dockerfile uses Python 3.12.
The quality job now selects 3.12 explicitly through the official setup-python
action before creating its venv. Dependency pins, fixture-source verification,
permissions, tests and thresholds remain unchanged. This setup repair is not an
application or native-workflow pass; the successor exact-source CI must run.

The SDK-hook fixture exposed a required ingestion field absent from the initial
candidate: the public project token. The filter now retains only the exact
configured existing public token and drops a missing/mismatched token. This is
public browser configuration, not an additional credential. The earlier candidate
and failed fixture attempts remain separate from the corrected source result.
