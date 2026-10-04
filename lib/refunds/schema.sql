CREATE TABLE ll_refund_policies (
 org_id text PRIMARY KEY REFERENCES ll_orgs(id), version integer NOT NULL DEFAULT 1,
 auto_limit integer NOT NULL DEFAULT 1000, hard_limit integer NOT NULL DEFAULT 10000,
 budget integer NOT NULL DEFAULT 25000, reserved integer NOT NULL DEFAULT 0,
 CHECK(0<=auto_limit AND auto_limit<=hard_limit AND hard_limit<=budget), CHECK(reserved>=0 AND reserved<=budget)
);
CREATE TABLE ll_refund_actions (
 org_id text REFERENCES ll_orgs(id), id uuid, agent_id text NOT NULL,
 payment_id text NOT NULL, amount integer NOT NULL CHECK(amount>0), currency text NOT NULL CHECK(currency='usd'),
 policy_version integer NOT NULL, payload_hash text NOT NULL,
 state text NOT NULL CHECK(state IN ('held','ready','executing','succeeded','blocked','rejected','cancelled','uncertain','conflict')),
 reason text NOT NULL, approved_by text, approval_until timestamptz,
 lease_token uuid, lease_until timestamptz, provider_id text, provider_status text,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,id),
 FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
CREATE TABLE ll_refund_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL, action_id uuid,
 kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,action_id) REFERENCES ll_refund_actions(org_id,id)
);
CREATE TRIGGER ll_refund_events_append_only BEFORE UPDATE OR DELETE ON ll_refund_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
