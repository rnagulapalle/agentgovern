-- Migration 16: optional discovery evidence only; no identity or execution grants.
CREATE TABLE ll_cloud_connections (
 org_id text NOT NULL REFERENCES ll_orgs(id), id text NOT NULL CHECK(id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 account_id text NOT NULL CHECK(account_id ~ '^[0-9]{12}$'),
 region text NOT NULL CHECK(region ~ '^[a-z]{2}-[a-z]+-[1-9]$'),
 created_by text NOT NULL REFERENCES ll_members(email), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id)
);
CREATE TABLE ll_cloud_scans (
 org_id text NOT NULL, connection_id text NOT NULL, id uuid NOT NULL,
 observed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 completeness text NOT NULL CHECK(completeness IN ('partial','complete-api-traversal')),
 failures text[] NOT NULL CHECK(cardinality(failures)<=2020 AND failures <@ ARRAY['list-unavailable','invalid-page','invalid-resource','detail-unavailable','invalid-detail','pagination-cycle','page-limit']::text[]),
 canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(org_id,connection_id,id), FOREIGN KEY(org_id,connection_id) REFERENCES ll_cloud_connections(org_id,id),
 CHECK(completeness<>'complete-api-traversal' OR cardinality(failures)=0)
);
CREATE TABLE ll_cloud_runtime_observations (
 org_id text NOT NULL, connection_id text NOT NULL, scan_id uuid NOT NULL,
 resource_id text NOT NULL CHECK(resource_id ~ '^[a-zA-Z][a-zA-Z0-9_]{0,47}-[a-zA-Z0-9]{10}$'),
 resource_arn text NOT NULL, version text NOT NULL CHECK(version ~ '^[1-9][0-9]{0,4}$'),
 role_reference text, workload_identity_reference text,
 PRIMARY KEY(org_id,connection_id,scan_id,resource_id,version),
 FOREIGN KEY(org_id,connection_id,scan_id) REFERENCES ll_cloud_scans(org_id,connection_id,id)
);
CREATE FUNCTION ll_cloud_inventory_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enrolled_account text; enrolled_region text; member_org text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Discovery history is append-only' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='ll_cloud_connections' THEN
  SELECT org_id INTO member_org FROM ll_members WHERE email=NEW.created_by AND active=true;
  IF member_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Discovery owner scope differs' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='ll_cloud_runtime_observations' THEN
  SELECT account_id,region INTO enrolled_account,enrolled_region FROM ll_cloud_connections WHERE org_id=NEW.org_id AND id=NEW.connection_id FOR SHARE;
  IF NEW.resource_arn IS DISTINCT FROM 'arn:aws:bedrock-agentcore:'||enrolled_region||':'||enrolled_account||':runtime/'||NEW.resource_id
   OR (NEW.role_reference IS NOT NULL AND (NEW.role_reference !~ '^arn:aws:iam::[0-9]{12}:role/[a-zA-Z0-9_+=,.@/-]+$' OR length(NEW.role_reference)>542 OR NEW.role_reference NOT LIKE 'arn:aws:iam::'||enrolled_account||':role/%'))
   OR (NEW.workload_identity_reference IS NOT NULL AND (NEW.workload_identity_reference !~ '^[a-zA-Z0-9_:/.-]+$' OR length(NEW.workload_identity_reference)>1024 OR NEW.workload_identity_reference NOT LIKE 'arn:aws:bedrock-agentcore:'||enrolled_region||':'||enrolled_account||':workload-identity-directory/%'))
   THEN RAISE EXCEPTION 'Discovery resource scope differs' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_cloud_connection_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_connections FOR EACH ROW EXECUTE FUNCTION ll_cloud_inventory_boundary();
CREATE TRIGGER ll_cloud_scan_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_scans FOR EACH ROW EXECUTE FUNCTION ll_cloud_inventory_boundary();
CREATE TRIGGER ll_cloud_observation_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_runtime_observations FOR EACH ROW EXECUTE FUNCTION ll_cloud_inventory_boundary();
REVOKE ALL ON ll_cloud_connections,ll_cloud_scans,ll_cloud_runtime_observations FROM PUBLIC;
