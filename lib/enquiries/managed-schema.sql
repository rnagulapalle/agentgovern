-- Migration 8: explicit background dispatch consent for one reviewed rehearsal.
CREATE TABLE ll_enquiry_dispatch (
 org_id text NOT NULL, plan_id uuid NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,plan_id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_enquiry_plans(org_id,id)
);
CREATE TRIGGER ll_enquiry_dispatch_append_only BEFORE UPDATE OR DELETE ON ll_enquiry_dispatch
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();

CREATE TABLE ll_enquiry_worker_status (
 org_id text PRIMARY KEY REFERENCES ll_orgs(id), last_tick timestamptz NOT NULL, last_plan uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
);
