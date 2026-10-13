-- Migration 20: quote destination and manager authority only. No dispatch support.
ALTER TABLE ll_connector_scopes ALTER COLUMN contact_id DROP NOT NULL;
ALTER TABLE ll_connector_scopes DROP CONSTRAINT ll_connector_scopes_contract_version_check;
ALTER TABLE ll_connector_scopes ADD COLUMN quote_id text;
ALTER TABLE ll_connector_scopes ADD COLUMN distributor_id text;
ALTER TABLE ll_connector_scopes ADD COLUMN email_binding_id text;
ALTER TABLE ll_connector_scopes ADD COLUMN sender text;
ALTER TABLE ll_connector_scopes ADD CONSTRAINT ll_scope_resource_contract CHECK (
 (contract_version='private-record-twin-2' AND contact_id IS NOT NULL AND quote_id IS NULL AND distributor_id IS NULL AND email_binding_id IS NULL AND sender IS NULL)
 OR (contract_version='private-quote-twin-1' AND contact_id IS NULL
 AND quote_id IS NOT NULL AND quote_id ~ '^[A-Za-z0-9_-]{1,64}$'
 AND distributor_id IS NOT NULL AND distributor_id ~ '^[A-Za-z0-9_-]{1,64}$'
 AND email_binding_id IS NOT NULL AND email_binding_id ~ '^[a-f0-9]{64}$'
 AND email_binding_id<>binding_id AND sender IS NOT NULL
 AND length(sender)<=254 AND sender ~ '^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+([.-][a-z0-9]+)*\.test$')
);
CREATE TABLE ll_quote_manager_grants (
 org_id text NOT NULL, scope_id uuid NOT NULL, member text NOT NULL REFERENCES ll_members(email),
 policy_version integer NOT NULL CHECK(policy_version>0),
 capability text NOT NULL CHECK(capability='quote.discount.approve'),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by text NOT NULL REFERENCES ll_members(email), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,scope_id,member,policy_version),
 FOREIGN KEY(org_id,scope_id) REFERENCES ll_connector_scopes(org_id,id), CHECK(member<>created_by)
);
CREATE FUNCTION ll_quote_authority_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM ll_members WHERE email=NEW.created_by AND org_id=NEW.org_id AND active=true)
 THEN RAISE EXCEPTION 'Current same-workspace named creator required' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='ll_quote_manager_grants' THEN
  IF NOT EXISTS(SELECT 1 FROM ll_members WHERE email=NEW.member AND org_id=NEW.org_id AND active=true)
  OR NOT EXISTS(SELECT 1 FROM ll_connector_scopes WHERE org_id=NEW.org_id AND id=NEW.scope_id AND active=true AND contract_version='private-quote-twin-1')
  THEN RAISE EXCEPTION 'Current quote scope and same-workspace manager required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Preserve legacy enrollment semantics; only quote inserts get this additional boundary.
CREATE FUNCTION ll_quote_scope_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.contract_version='private-quote-twin-1' THEN
  PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM ll_members WHERE email=NEW.created_by AND org_id=NEW.org_id AND active=true)
  THEN RAISE EXCEPTION 'Current same-workspace named creator required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_scope_insert BEFORE INSERT ON ll_connector_scopes
 FOR EACH ROW EXECUTE FUNCTION ll_quote_scope_insert_boundary();
CREATE TRIGGER ll_quote_manager_insert BEFORE INSERT ON ll_quote_manager_grants
 FOR EACH ROW EXECUTE FUNCTION ll_quote_authority_insert_boundary();
CREATE TRIGGER ll_quote_manager_boundary BEFORE UPDATE OR DELETE ON ll_quote_manager_grants
 FOR EACH ROW EXECUTE FUNCTION ll_scope_authority_boundary();
CREATE FUNCTION ll_quote_authority_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Authority cannot be truncated' USING ERRCODE='23514'; END $$;
CREATE TRIGGER ll_quote_manager_no_truncate BEFORE TRUNCATE ON ll_quote_manager_grants
 FOR EACH STATEMENT EXECUTE FUNCTION ll_quote_authority_no_truncate();

-- A member reactivation must not resurrect a previously saved manager grant.
CREATE FUNCTION ll_quote_manager_member_revoked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.active=true AND NEW.active=false) OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
  PERFORM id FROM ll_orgs WHERE id=OLD.org_id FOR UPDATE;
  UPDATE ll_quote_manager_grants SET active=false,version=version+1
   WHERE org_id=OLD.org_id AND member=OLD.email AND active=true;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_manager_member_revocation AFTER UPDATE OF active,org_id ON ll_members
 FOR EACH ROW EXECUTE FUNCTION ll_quote_manager_member_revoked();

CREATE FUNCTION ll_quote_manager_activation_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.active=true AND OLD.active=false THEN
  PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM ll_members WHERE email=NEW.member AND org_id=NEW.org_id AND active=true)
  OR NOT EXISTS(SELECT 1 FROM ll_connector_scopes WHERE org_id=NEW.org_id AND id=NEW.scope_id AND active=true AND contract_version='private-quote-twin-1')
  THEN RAISE EXCEPTION 'Current quote scope and same-workspace manager required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_manager_activation BEFORE UPDATE ON ll_quote_manager_grants
 FOR EACH ROW EXECUTE FUNCTION ll_quote_manager_activation_boundary();

-- SQL row mutation may already hold the scope/grant row. Never wait for a
-- workspace lock in that inverted order: fail closed and require retry/readback.
-- A refused revocation has not taken effect. Normal service owns this lock first.
CREATE FUNCTION ll_quote_authority_update_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='ll_connector_scopes' THEN
  IF OLD.contract_version<>'private-quote-twin-1' AND NEW.contract_version<>'private-quote-twin-1' THEN RETURN NEW; END IF;
 END IF;
 PERFORM id FROM ll_orgs WHERE id=OLD.org_id FOR UPDATE NOWAIT;
 RETURN NEW;
END $$;
-- Alphabetically before activation/immutable checks, including direct revocation.
CREATE TRIGGER ll_00_quote_scope_update_lock BEFORE UPDATE ON ll_connector_scopes
 FOR EACH ROW EXECUTE FUNCTION ll_quote_authority_update_lock();
CREATE TRIGGER ll_00_quote_manager_update_lock BEFORE UPDATE ON ll_quote_manager_grants
 FOR EACH ROW EXECUTE FUNCTION ll_quote_authority_update_lock();
