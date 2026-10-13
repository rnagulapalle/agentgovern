-- Migration18: accountable owner review only. No workload identity or execution grant.
CREATE TABLE ll_cloud_owner_reviews (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('aws-agentcore-runtime','azure-foundry','google-agent-engine')),
 connection_id text NOT NULL, scan_id uuid NOT NULL,
 scan_sha256 text NOT NULL CHECK(scan_sha256 ~ '^[a-f0-9]{64}$'),
 resource text NOT NULL CHECK(length(resource) BETWEEN 1 AND 1024), provider_version text NOT NULL,
 owner_email text NOT NULL REFERENCES ll_members(email), reviewed_by text NOT NULL REFERENCES ll_members(email),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(org_id,id)
);
CREATE INDEX ll_cloud_owner_review_lookup ON ll_cloud_owner_reviews(org_id,provider,connection_id,resource,provider_version,recorded_at DESC,id DESC);
CREATE FUNCTION ll_cloud_owner_review_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE latest_id uuid; latest_sha text; observed timestamptz; present boolean; person text; member_org text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Owner review history is append-only' USING ERRCODE='23514'; END IF;
 FOREACH person IN ARRAY ARRAY[NEW.owner_email,NEW.reviewed_by] LOOP
  SELECT org_id INTO member_org FROM ll_members WHERE email=person AND active=true;
  IF member_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Owner review member scope differs' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW.provider='aws-agentcore-runtime' THEN
  SELECT id,canonical_sha256,observed_at INTO latest_id,latest_sha,observed FROM ll_cloud_scans
   WHERE org_id=NEW.org_id AND connection_id=NEW.connection_id ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1;
  SELECT EXISTS(SELECT 1 FROM ll_cloud_runtime_observations WHERE org_id=NEW.org_id AND connection_id=NEW.connection_id
   AND scan_id=NEW.scan_id AND resource_arn=NEW.resource AND version=NEW.provider_version) INTO present;
 ELSE
  SELECT s.id,s.canonical_sha256,s.observed_at INTO latest_id,latest_sha,observed FROM ll_cloud_project_scans s
   JOIN ll_cloud_project_connections c ON c.org_id=s.org_id AND c.id=s.connection_id
   WHERE s.org_id=NEW.org_id AND s.connection_id=NEW.connection_id AND c.provider=NEW.provider
   ORDER BY s.observed_at DESC,s.recorded_at DESC,s.id DESC LIMIT 1;
  SELECT EXISTS(SELECT 1 FROM ll_cloud_project_observations WHERE org_id=NEW.org_id AND connection_id=NEW.connection_id
   AND scan_id=NEW.scan_id AND resource=NEW.resource AND provider_version=NEW.provider_version) INTO present;
 END IF;
 IF latest_id IS DISTINCT FROM NEW.scan_id OR latest_sha IS DISTINCT FROM NEW.scan_sha256 OR NOT present
  OR observed < clock_timestamp()-interval '15 minutes' OR observed > clock_timestamp()+interval '5 minutes'
  THEN RAISE EXCEPTION 'Owner review requires current exact discovery evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_cloud_owner_review_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_owner_reviews FOR EACH ROW EXECUTE FUNCTION ll_cloud_owner_review_boundary();
REVOKE ALL ON ll_cloud_owner_reviews FROM PUBLIC;
