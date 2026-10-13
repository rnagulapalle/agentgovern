-- PRIVATE UNAPPLIED PROTOTYPE; no released migration number or full inventory.
-- Owner setup must substitute a reviewed dedicated schema identifier.
-- Do not install partial RLS into an application deployment.
CREATE TABLE __SCHEMA__.ll_runtime_workspace_bindings (
 login_oid oid PRIMARY KEY, login_name name NOT NULL UNIQUE,
 database_oid oid NOT NULL, database_name name NOT NULL,
 org_id text NOT NULL REFERENCES __SCHEMA__.ll_orgs(id),
 purpose text NOT NULL CHECK (purpose IN ('web','worker','scheduler'))
);
REVOKE ALL ON __SCHEMA__.ll_runtime_workspace_bindings FROM PUBLIC;
CREATE FUNCTION __SCHEMA__.ll_bound_workspace() RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT b.org_id FROM __SCHEMA__.ll_runtime_workspace_bindings b
 JOIN pg_catalog.pg_roles r ON r.oid=b.login_oid AND r.rolname=b.login_name
 JOIN pg_catalog.pg_database d ON d.oid=b.database_oid AND d.datname=b.database_name
 WHERE r.rolname=session_user AND d.datname=current_database()
 AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
 AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
$$;
REVOKE ALL ON FUNCTION __SCHEMA__.ll_bound_workspace() FROM PUBLIC;

-- Minimal global name-presence fence. No foreign member attributes are exposed.
CREATE TABLE __SCHEMA__.ll_named_subject_presence(subject text PRIMARY KEY);
REVOKE ALL ON __SCHEMA__.ll_named_subject_presence FROM PUBLIC;
INSERT INTO __SCHEMA__.ll_named_subject_presence SELECT email FROM __SCHEMA__.ll_members;
CREATE FUNCTION __SCHEMA__.ll_named_subject_presence_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM __SCHEMA__.ll_named_subject_presence WHERE subject=OLD.email; RETURN OLD; END IF;
 INSERT INTO __SCHEMA__.ll_named_subject_presence(subject) VALUES(NEW.email) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION __SCHEMA__.ll_named_subject_presence_sync() FROM PUBLIC;
CREATE TRIGGER ll_named_subject_presence_sync AFTER INSERT OR DELETE ON __SCHEMA__.ll_members FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.ll_named_subject_presence_sync();
CREATE FUNCTION __SCHEMA__.ll_named_subject_exists(subject text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF __SCHEMA__.ll_bound_workspace() IS NULL OR subject IS NULL OR length(subject) NOT BETWEEN 1 AND 254 THEN
  RAISE EXCEPTION 'Bounded mapped runtime subject lookup required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM __SCHEMA__.ll_named_subject_presence p WHERE p.subject=ll_named_subject_exists.subject FOR SHARE NOWAIT;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION __SCHEMA__.ll_named_subject_exists(text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION __SCHEMA__.ll_runtime_agent_tokens_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (current_user='ll_runtime' OR __SCHEMA__.ll_bound_workspace() IS NOT NULL) AND NEW.role<>'agent'
 THEN RAISE EXCEPTION 'Runtime provisioning is limited to agent keys' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION __SCHEMA__.ll_member_snapshot23(workspace text, subject text, legacy_role text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m ll_members%ROWTYPE; g bigint; BEGIN
 PERFORM id FROM ll_orgs WHERE id=workspace FOR UPDATE NOWAIT;
 SELECT * INTO m FROM ll_members WHERE email=subject FOR SHARE NOWAIT;
 IF FOUND THEN
  IF m.org_id<>workspace OR NOT m.active THEN RAISE EXCEPTION 'Current named membership required' USING ERRCODE='23514'; END IF;
  SELECT generation INTO g FROM ll_quote_member_generations WHERE email=subject AND org_id=workspace;
  IF g IS NULL OR g<=0 THEN RAISE EXCEPTION 'Membership history unavailable' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('kind','member','subject',subject,'generation',g::text);
 END IF;
 IF __SCHEMA__.ll_named_subject_exists(subject) THEN RAISE EXCEPTION 'Current named membership required' USING ERRCODE='23514'; END IF;
 IF legacy_role IS NULL OR NOT EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=workspace AND t.subject=ll_member_snapshot23.subject AND t.role=legacy_role AND t.active=true)
 THEN RAISE EXCEPTION 'Explicit legacy identity required' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('kind','legacy','subject',subject,'role',legacy_role);
END $$;
ALTER TABLE __SCHEMA__.ll_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_orgs FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_orgs USING (id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_agents USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_tokens USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_records FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_records USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_actions USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_effects FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_effects USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_members FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_members USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_sessions USING (EXISTS(SELECT 1 FROM __SCHEMA__.ll_members m WHERE m.email=ll_sessions.email AND m.org_id=__SCHEMA__.ll_bound_workspace())) WITH CHECK (EXISTS(SELECT 1 FROM __SCHEMA__.ll_members m WHERE m.email=ll_sessions.email AND m.org_id=__SCHEMA__.ll_bound_workspace()));
ALTER TABLE __SCHEMA__.ll_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_agent_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_agent_profiles USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_sales_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_sales_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_sales_requests USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_refund_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_refund_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_refund_policies USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_refund_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_refund_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_refund_actions USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_refund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_refund_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_refund_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_policies USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_actions USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workflow_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workflow_runs USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workflow_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workflow_steps USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workflow_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workflow_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workflow_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workflow_agents FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workflow_agents USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
-- Explicit proposed revision-link table only; no future-table admission.
ALTER TABLE __SCHEMA__.ll_enquiry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_enquiry_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_enquiry_revisions USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_enquiry_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_enquiry_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_enquiry_plans USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_enquiry_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_enquiry_dispatch FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_enquiry_dispatch USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_enquiry_worker_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_enquiry_worker_status FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_enquiry_worker_status USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_temporal_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_temporal_dispatch FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_temporal_dispatch USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workspace_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workspace_recovery FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workspace_recovery USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_workspace_recovery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_workspace_recovery_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_workspace_recovery_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_scopes USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_scope_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_scope_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_scope_grants USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_connector_scope_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_connector_scope_events FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_connector_scope_events USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_temporal_record_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_temporal_record_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_temporal_record_routes USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_temporal_reset_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_temporal_reset_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_temporal_reset_intents USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_connections USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_scans USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_runtime_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_runtime_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_runtime_observations USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_project_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_project_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_project_connections USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_project_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_project_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_project_scans USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_project_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_project_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_project_observations USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_cloud_owner_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_cloud_owner_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_cloud_owner_reviews USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_quote_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_quote_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_quote_plans USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_quote_manager_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_quote_manager_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_quote_manager_grants USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());
ALTER TABLE __SCHEMA__.ll_quote_member_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_quote_member_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_quote_member_generations USING (org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK (org_id=__SCHEMA__.ll_bound_workspace());

-- Tenant-bound storage for the existing throttle service. Historical opaque-key
-- ll_access_attempts remains owner-only: no fabricated org backfill/adoption.
CREATE TABLE __SCHEMA__.ll_tenant_access_attempts (
 org_id text NOT NULL DEFAULT __SCHEMA__.ll_bound_workspace() REFERENCES __SCHEMA__.ll_orgs(id),
 key text NOT NULL, count integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,key)
);
REVOKE ALL ON __SCHEMA__.ll_tenant_access_attempts FROM PUBLIC;
ALTER TABLE __SCHEMA__.ll_tenant_access_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE __SCHEMA__.ll_tenant_access_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_tenant_prototype ON __SCHEMA__.ll_tenant_access_attempts
 USING(org_id=__SCHEMA__.ll_bound_workspace()) WITH CHECK(org_id=__SCHEMA__.ll_bound_workspace());
-- Classification survives SECURITY DEFINER current_user changes. Retained name
-- with recreated/unbound OID is invalid, not silently promoted to offline owner.
CREATE FUNCTION __SCHEMA__.ll_runtime_classification() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN b.login_name IS NOT NULL THEN CASE WHEN __SCHEMA__.ll_bound_workspace() IS NOT NULL THEN b.purpose ELSE 'invalid' END
 WHEN session_user='ll_runtime' THEN 'legacy-runtime' ELSE 'offline' END
 FROM (SELECT 1) anchor LEFT JOIN __SCHEMA__.ll_runtime_workspace_bindings b ON b.login_name=session_user
$$;
REVOKE ALL ON FUNCTION __SCHEMA__.ll_runtime_classification() FROM PUBLIC;
CREATE OR REPLACE FUNCTION __SCHEMA__.ll_runtime_agent_tokens_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE classification text; workspace text; BEGIN
 classification=__SCHEMA__.ll_runtime_classification();workspace=__SCHEMA__.ll_bound_workspace();
 IF classification IN ('web','worker','scheduler','invalid') AND (classification<>'web' OR NEW.role<>'agent' OR workspace IS NULL OR NEW.org_id IS DISTINCT FROM workspace)
 OR (classification='legacy-runtime' OR current_user='ll_runtime') AND NEW.role<>'agent'
 THEN RAISE EXCEPTION 'Runtime provisioning is limited to scoped agent keys' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Own these three narrow functions with a separately provisioned NOLOGIN
-- BYPASSRLS definer role: FORCE RLS does not exempt an ordinary table owner.
-- Broker receives EXECUTE only, no raw member/session/token/budget table grants.
CREATE FUNCTION __SCHEMA__.ll_login_workspace(email text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT org_id FROM __SCHEMA__.ll_members m WHERE length(ll_login_workspace.email) BETWEEN 1 AND 254 AND m.email=ll_login_workspace.email AND m.active=true
$$;
CREATE FUNCTION __SCHEMA__.ll_credential_workspace(hash text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE workspace text; BEGIN
 IF hash IS NULL OR hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT m.org_id INTO workspace FROM __SCHEMA__.ll_sessions s JOIN __SCHEMA__.ll_members m ON m.email=s.email
 WHERE s.hash=ll_credential_workspace.hash AND s.expires_at>now() AND m.active=true;
 IF FOUND THEN RETURN workspace; END IF;
 SELECT t.org_id INTO workspace FROM __SCHEMA__.ll_tokens t WHERE t.hash=ll_credential_workspace.hash AND t.active=true
 AND NOT EXISTS(SELECT 1 FROM __SCHEMA__.ll_named_subject_presence p WHERE p.subject=t.subject);
 RETURN workspace;
END $$;
CREATE FUNCTION __SCHEMA__.ll_global_admit(purpose text,principal text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE global_key text; principal_key text; global_limit integer; global_seconds integer; principal_limit integer; principal_seconds integer; g integer; p integer; BEGIN
 IF purpose NOT IN ('login','chat','sales') OR purpose IS NULL OR principal IS NULL OR principal !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Bounded admission key required' USING ERRCODE='42501'; END IF;
 IF purpose='login' THEN global_key='login-global';principal_key='login:'||principal;global_limit=120;global_seconds=300;principal_limit=8;principal_seconds=900;
 ELSIF purpose='sales' THEN global_key='sales-global';principal_key='sales:'||principal;global_limit=10;global_seconds=300;principal_limit=10;principal_seconds=300;
 ELSE global_key='chat-global';principal_key='chat:'||principal;global_limit=150;global_seconds=3600;principal_limit=30;principal_seconds=3600; END IF;
 INSERT INTO __SCHEMA__.ll_access_attempts(key,count) VALUES(global_key,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ll_access_attempts.window_start<now()-(global_seconds*interval '1 second') THEN 1 ELSE ll_access_attempts.count+1 END,window_start=CASE WHEN ll_access_attempts.window_start<now()-(global_seconds*interval '1 second') THEN now() ELSE ll_access_attempts.window_start END RETURNING count INTO g;
 INSERT INTO __SCHEMA__.ll_access_attempts(key,count) VALUES(principal_key,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ll_access_attempts.window_start<now()-(principal_seconds*interval '1 second') THEN 1 ELSE ll_access_attempts.count+1 END,window_start=CASE WHEN ll_access_attempts.window_start<now()-(principal_seconds*interval '1 second') THEN now() ELSE ll_access_attempts.window_start END RETURNING count INTO p;
 RETURN g<=global_limit AND p<=principal_limit;
END $$;
REVOKE ALL ON FUNCTION __SCHEMA__.ll_login_workspace(text),__SCHEMA__.ll_credential_workspace(text),__SCHEMA__.ll_global_admit(text,text) FROM PUBLIC;
