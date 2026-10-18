-- Migration 28: observation enrollment only. No tool credentials or execution grants.
CREATE TABLE ll_cloud_observation_enrollments (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL,
 connection_id text NOT NULL, scan_id uuid NOT NULL, resource_arn text NOT NULL,
 provider_version text NOT NULL CHECK(provider_version ~ '^[1-9][0-9]{0,4}$'),
 owner_review_id uuid NOT NULL, owner_email text NOT NULL REFERENCES ll_members(email),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 100 AND display_name !~ '[[:cntrl:]]'),
 log_group text NOT NULL CHECK(log_group ~ '^/[A-Za-z0-9_./#-]{1,250}$'),
 mapping text NOT NULL CHECK(mapping='business-events-1.0'), epoch uuid NOT NULL,
 reviewed_by text NOT NULL REFERENCES ll_members(email), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX ll_cloud_observation_lookup ON ll_cloud_observation_enrollments(org_id,connection_id,resource_arn,provider_version,recorded_at DESC,id DESC);
CREATE FUNCTION ll_cloud_observation_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_review record; recovery_epoch uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Observation enrollment is append-only' USING ERRCODE='23514'; END IF;
 SELECT * INTO owner_review FROM ll_cloud_owner_reviews WHERE org_id=NEW.org_id AND id=NEW.owner_review_id;
 SELECT epoch INTO recovery_epoch FROM ll_workspace_recovery WHERE org_id=NEW.org_id;
 IF owner_review.id IS NULL OR owner_review.provider<>'aws-agentcore-runtime'
  OR owner_review.connection_id IS DISTINCT FROM NEW.connection_id OR owner_review.scan_id IS DISTINCT FROM NEW.scan_id
  OR owner_review.resource IS DISTINCT FROM NEW.resource_arn OR owner_review.provider_version IS DISTINCT FROM NEW.provider_version
  OR owner_review.owner_email IS DISTINCT FROM NEW.owner_email OR owner_review.reviewed_by IS DISTINCT FROM NEW.reviewed_by
  OR recovery_epoch IS DISTINCT FROM NEW.epoch
  OR NOT EXISTS(SELECT 1 FROM ll_members WHERE org_id=NEW.org_id AND email=NEW.owner_email AND active=true)
  OR NOT EXISTS(SELECT 1 FROM ll_members WHERE org_id=NEW.org_id AND email=NEW.reviewed_by AND active=true)
 THEN RAISE EXCEPTION 'Current exact observation owner and recovery epoch required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_cloud_observation_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_observation_enrollments FOR EACH ROW EXECUTE FUNCTION ll_cloud_observation_boundary();
REVOKE ALL ON ll_cloud_observation_enrollments FROM PUBLIC;
-- Existing installed deployments already have the trusted role/OID binding helper.
DO $$ BEGIN
 IF to_regprocedure('ll_bound_workspace()') IS NOT NULL THEN
  ALTER TABLE ll_cloud_observation_enrollments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ll_cloud_observation_enrollments FORCE ROW LEVEL SECURITY;
  CREATE POLICY ll_tenant_prototype ON ll_cloud_observation_enrollments USING(org_id=ll_bound_workspace()) WITH CHECK(org_id=ll_bound_workspace());
 END IF;
END $$;
