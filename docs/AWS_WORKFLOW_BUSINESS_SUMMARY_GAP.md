# Business summaries in observed AWS activity

The “Request received” timeline entry describes an observed discount percentage or the quote-related tools actually reported. It shows the trigger channel and reported deployment version, and explains that the displayed time is the workflow processing start, not an independently observed message-arrival time. It never reconstructs the original message.

The local timeline presentation maps known action names to readable stages and preserves each source-reported state. Raw event identifiers and source events remain under Technical details. Search and outcome filters operate on the loaded observation window; they do not authorize or execute work. A completed workflow with an uncertain tool event remains in the needs-attention filter.

The currently inspected AgentCore v15 quote-creation event stream supplies action names, providers, timestamps and the reported outcome. It does not include a quote ID, amount, currency or seat quantity for that creation path. LoopLabs must not reconstruct these values from Slack screenshots, infer them from step order, parse arbitrary customer messages, or reuse values from another run. The UI explicitly shows that the amount was not shared. Other paths can already emit the separately validated quote_id/approval_id fields.

## Workflow-builder contract gap

To display a business result, the workflow builder must emit a safe structured summary tied to the same run and specific operation. Agree and version its schema before enabling ingestion. It should include:

- The business record reference and whether it is the source record or newly produced result.
- The proposed and final amounts separately, with explicit currency and monetary units; a proposed amount must never be presented as applied.
- Product and quantity only as reviewed structured fields, without customer messages or personal data.
- Result status and correlation to the tool action/attempt that produced it. A held or denied request must not claim a delivered result.

LoopLabs ingestion will need strict validation, bounded values, same-run/operation association and conflicting-summary handling. These business-summary fields and their native acceptance are not implemented by the timeline-only change. No AWS workflow, CRM, Slack routing or approval authority is changed here.
