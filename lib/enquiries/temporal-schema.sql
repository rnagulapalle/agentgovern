-- Migration 9: one-way ownership and transactional Temporal start outbox.
CREATE TABLE ll_temporal_dispatch (
 org_id text NOT NULL, plan_id uuid NOT NULL, workflow_id text NOT NULL,
 plan_hash text NOT NULL, plan_version text NOT NULL CHECK(plan_version='acknowledgement-1'),
 connector_version text NOT NULL CHECK(connector_version='private-twin-1'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','started')),
 lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
 PRIMARY KEY(org_id,plan_id), UNIQUE(workflow_id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_enquiry_dispatch(org_id,plan_id)
);
CREATE FUNCTION ll_temporal_dispatch_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['state','lease_token','lease_until','attempts','next_attempt','started_at']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['state','lease_token','lease_until','attempts','next_attempt','started_at'])
 OR (OLD.state='started' AND NEW.state<>'started') THEN RAISE EXCEPTION 'Temporal ownership cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_temporal_dispatch_immutable BEFORE UPDATE OR DELETE ON ll_temporal_dispatch
FOR EACH ROW EXECUTE FUNCTION ll_temporal_dispatch_boundary();
CREATE INDEX ll_temporal_dispatch_due ON ll_temporal_dispatch(org_id,next_attempt) WHERE state='pending';
