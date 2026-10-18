# Independent runner alert monitor

The bounded acknowledgement runner exposes health separately from saved workflow
state. `temporal:alerts` observes worker and scheduler health without access to
workflow approval or execution APIs. Three consecutive failed observations open an
unavailable incident. A ready response resolves it. A dispatch backlog older than
60 seconds opens a separate incident; an unavailable response cannot establish
backlog recovery. Alerts contain role, condition, transition, timestamp and a random
incident-transition ID, never customer content, connector requests or credentials.

## Scope and evidence

`pnpm temporal:alert-proof` starts actual monitor processes and controlled local HTTP
health/alert receivers. It stops the worker health endpoint, persists a pending
alert, has the receiver accept it and drop the response, restarts the monitor,
checks the same signed event ID is retried, then proves recovery, backlog transitions
and refusal of a malformed journal. `docs/evidence/temporal-alert-proof.json` records
observations and source fingerprints. The health fixture uses `OperationsHealth`;
this is **not** a new actual Temporal-container failure drill or an alert received
by a designated production operator. Existing container fault evidence remains
separate. The enterprise monitoring acceptance gate remains open.

## Deployment contract

Run one separately supervised monitor per configured worker/scheduler pair,
preferably outside their host failure domain. Do not make it an activity or a
workflow task. Its durable journal must reside on persistent storage outside the
worker image, in an existing private directory (mode 0700). Only a single instance
may write that journal. Configuration:

- `LOOPLABS_WORKER_HEALTH_URL`, `LOOPLABS_SCHEDULER_HEALTH_URL`: explicitly configured
  private health endpoints. Existing service health ports bind loopback; a remote
  monitor needs an authenticated private TLS health gateway or an approved private
  tunnel. This change does not expose those ports publicly or build that gateway.
- `LOOPLABS_ALERT_URL`: approved HTTPS receiver implementing the contract below.
- `LOOPLABS_ALERT_KEY_FILE`: a private file (mode 0600) containing at least 32 bytes
  of signing key material. Provision and rotate outside Git.
- `LOOPLABS_ALERT_JOURNAL`: absolute path in that protected persistent directory.
- `LOOPLABS_ALERT_LOCAL_PROOF=true`: permits credential-free loopback HTTP for local
  proof only. Redirects are refused. Remote plaintext HTTP is always refused.

Start `pnpm temporal:alerts`; `once` as a final argument performs a single pass.
Health requests and deliveries have a three-second timeout. Health bodies are
bounded to 16 KiB. The normal interval is five seconds **after** each pass, so
three failed observations are not a fixed 15-second availability guarantee.
A pass sends at most 20 queued transitions. A failed delivery remains pending and
is retried on the next pass. A queue of 1,000 pending transitions refuses further
transitions and stops the monitor for operator intervention; no silent eviction.
These bounds are operational controls, not a customer SLA.

## Receiver and restart semantics

The receiver must verify `X-LoopLabs-Signature` as hex HMAC-SHA256 over the exact raw
request bytes, reject invalid signatures and durably deduplicate `Idempotency-Key`.
After durable acceptance, return 2xx. The transition ID in the body must equal the
header. The receiver must implement retention, freshness/replay handling, routing
to the designated on-call operator and escalation appropriate to the pilot.
A 2xx proves receiver acceptance, not that a person read the notification.
The local proof receiver verifies signatures and deduplicates in memory; it is not
that production service. No private email, Slack message or real operator alert
was sent by this change.

The monitor atomically replaces and fsyncs its journal before delivery; it removes
an item only after receiver acceptance. A crash between acknowledgement and journal
save can resend the same ID. Delivery is **at least once**, never exactly once.
Restoring an old journal can also resend old transitions. Preserve deduplication
history at the receiver, do not delete a pending queue to silence an incident, and
reconcile journal restores with the receiver.

An exclusive `.lock` file prevents concurrent writers. SIGTERM/SIGINT close it
normally. SIGKILL leaves it behind: confirm the old process is stopped and the
journal is intact before removing only the lock and restarting. Automatic stale
lock removal is intentionally absent. The supervisor must alert on monitor exit
or a stale monitor heartbeat independently; this monitor cannot detect its own
host failure. Journal corruption, lost storage or incorrect endpoints fail closed
and require intervention. Database-independent HTTP observation can detect an
unavailable runner during a database outage, but complete network/monitor/receiver
outage delivery and a real on-call escalation drill remain unproved.

## Business safety boundary

Observing health or delivering an alert never grants authority, changes approvals,
releases an uncertain action or retries a connector. Saved run state and effect
verification remain authoritative. Operational health is not evidence that a
customer message was delivered. Production runner selection and site releases
still require the existing release and ownership gates.

## Industry integration

Temporal's production guidance separates application workers from the production
service. Its monitoring guidance exposes service and SDK metrics to Prometheus,
Grafana, OpenTelemetry or other observability systems. This small monitor adds a
bounded health-to-alert proof; it does not replace those service/SDK metrics,
latency distributions, tracing or a production on-call platform. Exporting SDK
metrics and verifying the designated incident route remain subsequent gates.

- https://docs.temporal.io/production-deployment
- https://docs.temporal.io/self-hosted-guide/monitoring
