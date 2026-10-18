-- Migration17: optional project inventory evidence. No grants of execution authority.
CREATE TABLE ll_cloud_project_connections (
 org_id text NOT NULL REFERENCES ll_orgs(id), id text NOT NULL CHECK(id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'),
 provider text NOT NULL CHECK(provider IN ('azure-foundry','google-agent-engine')),
 directory_id text, endpoint text, project_id text, project_number text, location text,
 created_by text NOT NULL REFERENCES ll_members(email), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id),
 CHECK((provider='azure-foundry' AND directory_id ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  AND endpoint ~ '^https://[a-z0-9][a-z0-9-]{0,62}\.services\.ai\.azure\.com/api/projects/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'
  AND directory_id IS NOT NULL AND endpoint IS NOT NULL AND project_id IS NULL AND project_number IS NULL AND location IS NULL)
 OR (provider='google-agent-engine' AND directory_id IS NULL AND endpoint IS NULL
  AND project_id ~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' AND project_number ~ '^[1-9][0-9]{5,19}$' AND location ~ '^[a-z]+-[a-z]+[1-9][0-9]?$'
  AND project_id IS NOT NULL AND project_number IS NOT NULL AND location IS NOT NULL))
);
CREATE TABLE ll_cloud_project_scans (
 org_id text NOT NULL, connection_id text NOT NULL, id uuid NOT NULL,
 observed_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 completeness text NOT NULL CHECK(completeness IN ('partial','complete-api-traversal')),
 failures text[] NOT NULL CHECK(cardinality(failures)<=10000 AND failures <@ ARRAY['list-unavailable','invalid-page','invalid-resource','detail-unavailable','invalid-detail','pagination-cycle','page-limit']::text[]),
 canonical_sha256 text NOT NULL CHECK(canonical_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(org_id,connection_id,id), FOREIGN KEY(org_id,connection_id) REFERENCES ll_cloud_project_connections(org_id,id),
 CHECK(completeness<>'complete-api-traversal' OR cardinality(failures)=0)
);
CREATE TABLE ll_cloud_project_observations (
 org_id text NOT NULL, connection_id text NOT NULL, scan_id uuid NOT NULL,
 resource text NOT NULL CHECK(length(resource)<=1024), provider_version text NOT NULL,
 identity_kind text NOT NULL CHECK(identity_kind IN ('unknown','service-account','agent-identity')), identity_reference text,
 PRIMARY KEY(org_id,connection_id,scan_id,resource,provider_version),
 FOREIGN KEY(org_id,connection_id,scan_id) REFERENCES ll_cloud_project_scans(org_id,connection_id,id)
);
CREATE FUNCTION ll_cloud_project_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enrolled ll_cloud_project_connections%ROWTYPE; member_org text; suffix text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Project discovery history is append-only' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='ll_cloud_project_connections' THEN
  SELECT org_id INTO member_org FROM ll_members WHERE email=NEW.created_by AND active=true;
  IF member_org IS DISTINCT FROM NEW.org_id THEN RAISE EXCEPTION 'Project discovery owner scope differs' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='ll_cloud_project_observations' THEN
  SELECT * INTO enrolled FROM ll_cloud_project_connections WHERE org_id=NEW.org_id AND id=NEW.connection_id FOR SHARE;
  IF enrolled.provider='azure-foundry' THEN
   suffix := substring(NEW.resource from length(enrolled.endpoint)+1);
   IF left(NEW.resource,length(enrolled.endpoint)) IS DISTINCT FROM enrolled.endpoint
    OR suffix !~ '^/agents/[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/versions/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'
    OR NEW.provider_version !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$'
    OR right(NEW.resource,length(NEW.provider_version)+1) IS DISTINCT FROM '/'||NEW.provider_version
    OR NEW.identity_kind<>'unknown' OR NEW.identity_reference IS NOT NULL
    THEN RAISE EXCEPTION 'Azure observation scope differs' USING ERRCODE='23514'; END IF;
  ELSIF enrolled.provider='google-agent-engine' THEN
   suffix := 'projects/'||enrolled.project_number||'/locations/'||enrolled.location||'/reasoningEngines/';
   IF left(NEW.resource,length(suffix)) IS DISTINCT FROM suffix
    OR substring(NEW.resource from length(suffix)+1) !~ '^[a-zA-Z0-9_-]{1,128}$' OR NEW.provider_version<>''
    OR (NEW.identity_kind='service-account' AND (NEW.identity_reference IS NULL OR NEW.identity_reference !~ '^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$' OR split_part(NEW.identity_reference,'@',2) IS DISTINCT FROM enrolled.project_id||'.iam.gserviceaccount.com'))
    OR (NEW.identity_kind<>'service-account' AND NEW.identity_reference IS NOT NULL)
    THEN RAISE EXCEPTION 'Google observation scope differs' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Project connection unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_cloud_project_connection_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_project_connections FOR EACH ROW EXECUTE FUNCTION ll_cloud_project_boundary();
CREATE TRIGGER ll_cloud_project_scan_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_project_scans FOR EACH ROW EXECUTE FUNCTION ll_cloud_project_boundary();
CREATE TRIGGER ll_cloud_project_observation_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_cloud_project_observations FOR EACH ROW EXECUTE FUNCTION ll_cloud_project_boundary();
REVOKE ALL ON ll_cloud_project_connections,ll_cloud_project_scans,ll_cloud_project_observations FROM PUBLIC;
