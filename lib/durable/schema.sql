CREATE TABLE IF NOT EXISTS ll_orgs (
  id text PRIMARY KEY, policy_version integer NOT NULL DEFAULT 1,
  auto_limit integer NOT NULL DEFAULT 10, hard_limit integer NOT NULL DEFAULT 50,
  CHECK (auto_limit >= 0 AND auto_limit <= hard_limit AND hard_limit <= 100)
);
CREATE TABLE IF NOT EXISTS ll_agents (
  org_id text REFERENCES ll_orgs(id), id text, active boolean NOT NULL DEFAULT true,
  tools text[] NOT NULL DEFAULT ARRAY['proof.discount'], action_limit integer NOT NULL DEFAULT 100,
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0), PRIMARY KEY(org_id,id),
  CHECK (reserved <= action_limit)
);
CREATE TABLE IF NOT EXISTS ll_tokens (
  hash text PRIMARY KEY, org_id text NOT NULL REFERENCES ll_orgs(id), subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('operator','agent','worker')),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS ll_records (
  org_id text PRIMARY KEY REFERENCES ll_orgs(id), version integer NOT NULL DEFAULT 1,
  discount integer NOT NULL DEFAULT 0 CHECK(discount BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS ll_actions (
  org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL, agent_id text NOT NULL,
  discount integer NOT NULL CHECK(discount BETWEEN 0 AND 100), expected_version integer NOT NULL,
  policy_version integer NOT NULL, payload_hash text NOT NULL,
  state text NOT NULL CHECK(state IN ('held','ready','executing','succeeded','blocked','rejected','cancelled','uncertain','conflict','recovered')),
  reason text NOT NULL, approved_by text, approval_until timestamptz,
  lease_token uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,id), FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
CREATE INDEX IF NOT EXISTS ll_actions_queue ON ll_actions(org_id,created_at) WHERE state='ready';
CREATE TABLE IF NOT EXISTS ll_effects (
  org_id text NOT NULL, action_id uuid NOT NULL, before_discount integer NOT NULL,
  after_discount integer NOT NULL, after_version integer NOT NULL,
  recovered boolean NOT NULL DEFAULT false, PRIMARY KEY(org_id,action_id),
  FOREIGN KEY(org_id,action_id) REFERENCES ll_actions(org_id,id)
);
CREATE TABLE IF NOT EXISTS ll_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL REFERENCES ll_orgs(id),
  action_id uuid, kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,action_id) REFERENCES ll_actions(org_id,id)
);
CREATE OR REPLACE FUNCTION ll_no_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Control events cannot be updated or deleted'; END $$;
DROP TRIGGER IF EXISTS ll_events_append_only ON ll_events;
CREATE TRIGGER ll_events_append_only BEFORE UPDATE OR DELETE ON ll_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
