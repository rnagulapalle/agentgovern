CREATE TABLE ll_backoffice_plans (
 org_id text REFERENCES ll_orgs(id), id uuid, plan jsonb NOT NULL, hash text NOT NULL,
 created_by text NOT NULL, published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,id)
);
CREATE TABLE ll_backoffice_cases (
 org_id text, id uuid, plan_id uuid, amount integer NOT NULL CHECK(amount>0),
 created_by text NOT NULL, approved_by text, approval_until timestamptz,
 payload_hash text NOT NULL, policy_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('held','ready','cancelling','cancel_uncertain','refund_ready','refunding','refund_uncertain','email_ready','emailing','email_uncertain','completed','blocked')),
 reason text NOT NULL, refund_id uuid NOT NULL, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_backoffice_plans(org_id,id)
);
CREATE TABLE ll_backoffice_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text, case_id uuid,
 kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,case_id) REFERENCES ll_backoffice_cases(org_id,id)
);
CREATE TRIGGER ll_backoffice_events_append_only BEFORE UPDATE OR DELETE ON ll_backoffice_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
