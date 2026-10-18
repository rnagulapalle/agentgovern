-- Migration 7: version 6 is reserved by the separate back-office proposal.
CREATE TABLE ll_enquiry_plans (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL,
 fixture_id text NOT NULL, source_version text NOT NULL, policy_versions jsonb NOT NULL,
 plan jsonb NOT NULL, plan_hash text NOT NULL, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), run_id uuid,
 PRIMARY KEY(org_id,id), FOREIGN KEY(org_id,run_id) REFERENCES ll_workflow_runs(org_id,id)
);
CREATE FUNCTION ll_enquiry_plan_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'run_id') IS DISTINCT FROM (to_jsonb(OLD)-'run_id')
 OR (OLD.run_id IS NOT NULL AND NEW.run_id IS DISTINCT FROM OLD.run_id)
 THEN RAISE EXCEPTION 'Enquiry plans cannot be rewritten'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_enquiry_plan_boundary BEFORE UPDATE OR DELETE ON ll_enquiry_plans
FOR EACH ROW EXECUTE FUNCTION ll_enquiry_plan_immutable();
