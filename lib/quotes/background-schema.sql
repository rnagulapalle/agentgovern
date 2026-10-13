-- Private additive draft; this is not a released migration or installation proof.
CREATE TABLE ll_quote_background_routes (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 plan_id uuid NOT NULL,
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[0-9a-f]{64}$'),
 recovery_epoch uuid NOT NULL,
 worker_role_oid oid NOT NULL,
 scheduler_role_oid oid NOT NULL,
 worker_build_id text NOT NULL CHECK(worker_build_id ~ '^quote-[0-9a-f]{64}$'),
 workflow_id text NOT NULL,
 authority jsonb NOT NULL,
 contract jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','started')),
 lease_token uuid,
 lease_until timestamptz,
 next_attempt timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 started_at timestamptz,
 PRIMARY KEY(org_id,plan_id),
 UNIQUE(org_id,workflow_id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_quote_plans(org_id,id)
);
ALTER TABLE ll_quote_background_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ll_quote_background_routes FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_quote_background_org ON ll_quote_background_routes
 USING(org_id=ll_bound_workspace()) WITH CHECK(org_id=ll_bound_workspace());
CREATE FUNCTION ll_quote_background_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Quote background intent cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['state','lease_token','lease_until','next_attempt','attempts','started_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lease_token','lease_until','next_attempt','attempts','started_at']) THEN
  RAISE EXCEPTION 'Quote background intent is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_background_immutable BEFORE UPDATE OR DELETE ON ll_quote_background_routes FOR EACH ROW EXECUTE FUNCTION ll_quote_background_immutable();
CREATE TABLE ll_quote_workload_roles (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 role_oid oid NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('worker','scheduler')),
 PRIMARY KEY(org_id,purpose)
);
ALTER TABLE ll_quote_workload_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ll_quote_workload_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY ll_quote_workload_org ON ll_quote_workload_roles USING(org_id=ll_bound_workspace()) WITH CHECK(org_id=ll_bound_workspace());
