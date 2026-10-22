-- Proposed optional migration 32. Test-only candidate; not in the frozen base.
-- Production requires source/inventory/recovery and route/profile acceptance.
-- Run after the existing tenant binding functions exist, never on an unbound role.
CREATE TABLE ll_booking_deliveries (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 scope text NOT NULL CHECK(octet_length(scope)<=512),
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,scope,digest)
);
CREATE TABLE ll_booking_reservations (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 scope text NOT NULL CHECK(octet_length(scope)<=512),
 uid text NOT NULL CHECK(uid ~ '^[-a-zA-Z0-9_]{1,128}$'),
 state text NOT NULL CHECK(state IN ('reserved','requested','cancelled','superseded')),
 occurred_at timestamptz NOT NULL,
 intake_ref uuid,
 predecessor text,
 successor text,
 classification text NOT NULL CHECK(classification IN ('test','external')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 PRIMARY KEY(org_id,scope,uid),
 CHECK(predecessor IS NULL OR predecessor<>uid),
 CHECK(successor IS NULL OR successor<>uid)
);
ALTER TABLE ll_booking_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ll_booking_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_booking_scope ON ll_booking_deliveries USING(org_id=ll_bound_workspace()) WITH CHECK(org_id=ll_bound_workspace());
ALTER TABLE ll_booking_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ll_booking_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_booking_scope ON ll_booking_reservations USING(org_id=ll_bound_workspace()) WITH CHECK(org_id=ll_bound_workspace());
REVOKE ALL ON ll_booking_deliveries,ll_booking_reservations FROM PUBLIC;
