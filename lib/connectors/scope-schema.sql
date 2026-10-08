-- Migration 12: immutable enrolled destinations and versioned agent grants.
-- No legacy action, plan, dispatch ownership or permission is upgraded.
CREATE TABLE ll_connector_scopes (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL,
 contact_id text NOT NULL CHECK(contact_id ~ '^[0-9]{1,24}$' AND contact_id<>'1001'),
 recipient text NOT NULL CHECK(length(recipient)<=254 AND recipient ~ '^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+([.-][a-z0-9]+)*\.test$'),
 binding_id text NOT NULL CHECK(binding_id ~ '^[a-f0-9]{64}$'),
 contract_version text NOT NULL CHECK(contract_version='private-record-twin-2'),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id), UNIQUE(org_id,binding_id)
);
CREATE TABLE ll_connector_scope_grants (
 org_id text NOT NULL, scope_id uuid NOT NULL, agent_id text NOT NULL,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,scope_id,agent_id),
 FOREIGN KEY(org_id,scope_id) REFERENCES ll_connector_scopes(org_id,id),
 FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
CREATE FUNCTION ll_scope_authority_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Enrolled authority cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['active','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','version'])
 OR (NEW.active IS DISTINCT FROM OLD.active AND NEW.version<>OLD.version+1)
 OR (NEW.active IS NOT DISTINCT FROM OLD.active AND NEW.version<>OLD.version)
 THEN RAISE EXCEPTION 'Enrolled scope is immutable; authority changes require the next version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_connector_scope_boundary BEFORE UPDATE OR DELETE ON ll_connector_scopes
FOR EACH ROW EXECUTE FUNCTION ll_scope_authority_boundary();
CREATE TRIGGER ll_connector_scope_grant_boundary BEFORE UPDATE OR DELETE ON ll_connector_scope_grants
FOR EACH ROW EXECUTE FUNCTION ll_scope_authority_boundary();
CREATE TABLE ll_connector_scope_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL, scope_id uuid NOT NULL,
 agent_id text, kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,scope_id) REFERENCES ll_connector_scopes(org_id,id)
);
CREATE TRIGGER ll_connector_scope_events_append_only BEFORE UPDATE OR DELETE ON ll_connector_scope_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
