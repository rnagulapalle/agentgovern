-- Migration 22: saved quote membership history only; no approval or execution.
-- Historical plans remain readable, but NULL generations never regain authority.
CREATE TABLE ll_quote_member_generations (
 email text PRIMARY KEY REFERENCES ll_members(email),
 org_id text NOT NULL REFERENCES ll_orgs(id),
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0)
);
INSERT INTO ll_quote_member_generations(email,org_id) SELECT email,org_id FROM ll_members;
ALTER TABLE ll_quote_plans ADD COLUMN requester_membership_generation bigint;
ALTER TABLE ll_quote_plans ADD COLUMN manager_membership_generation bigint;
ALTER TABLE ll_quote_plans ADD CONSTRAINT ll_quote_membership_pair CHECK(
 (requester_membership_generation IS NULL AND manager_membership_generation IS NULL) OR
 (requester_membership_generation IS NOT NULL AND manager_membership_generation IS NOT NULL
 AND requester_membership_generation>0 AND manager_membership_generation>0));

CREATE FUNCTION ll_quote_member_generation_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR pg_trigger_depth()<2 THEN
  RAISE EXCEPTION 'Quote membership history cannot be directly rewritten' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.email<>OLD.email OR NEW.generation<>OLD.generation+1) THEN
  RAISE EXCEPTION 'Quote membership generation must advance exactly once' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM ll_members WHERE email=NEW.email AND org_id=NEW.org_id)
 THEN RAISE EXCEPTION 'Current quote membership identity required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_member_generation_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_quote_member_generations
 FOR EACH ROW EXECUTE FUNCTION ll_quote_member_generation_boundary();
CREATE TRIGGER ll_quote_member_generation_no_truncate BEFORE TRUNCATE ON ll_quote_member_generations
 FOR EACH STATEMENT EXECUTE FUNCTION ll_quote_authority_no_truncate();

-- A direct member updater already owns its member row: never wait in the
-- opposite order from a workspace reader. Refusal is NOT a committed revocation.
CREATE FUNCTION ll_quote_member_lifecycle_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email THEN
  RAISE EXCEPTION 'Quote member identity cannot be renamed' USING ERRCODE='23514';
 END IF;
 IF (OLD.active=true AND NEW.active=false) OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
  PERFORM id FROM ll_orgs WHERE id IN(OLD.org_id,NEW.org_id) ORDER BY id FOR UPDATE NOWAIT;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_00_quote_member_lifecycle_lock BEFORE UPDATE OF email,active,org_id ON ll_members
 FOR EACH ROW EXECUTE FUNCTION ll_quote_member_lifecycle_lock();
CREATE FUNCTION ll_quote_member_lifecycle_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO ll_quote_member_generations(email,org_id) VALUES(NEW.email,NEW.org_id);
 ELSIF (OLD.active=true AND NEW.active=false) OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
  UPDATE ll_quote_member_generations SET org_id=NEW.org_id,generation=generation+1 WHERE email=OLD.email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote membership history unavailable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_member_lifecycle_generation AFTER INSERT OR UPDATE OF active,org_id ON ll_members
 FOR EACH ROW EXECUTE FUNCTION ll_quote_member_lifecycle_generation();

CREATE FUNCTION ll_quote_plan_membership_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE members integer; BEGIN
 IF NEW.requester_membership_generation IS NOT NULL OR NEW.manager_membership_generation IS NOT NULL THEN
  RAISE EXCEPTION 'Quote membership generations are server-owned' USING ERRCODE='23514';
 END IF;
 IF NEW.plan->>'version'<>'distributor-quote-plan-2' THEN RETURN NEW; END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
 -- Lock after the workspace lock, default deny when direct SQL owns a member row.
 PERFORM email FROM ll_members WHERE org_id=NEW.org_id AND email IN(NEW.created_by,NEW.plan->>'approver') AND active=true FOR SHARE NOWAIT;
 GET DIAGNOSTICS members=ROW_COUNT;
 IF members<>2 THEN RAISE EXCEPTION 'Current independent quote members required' USING ERRCODE='23514'; END IF;
 SELECT generation INTO NEW.requester_membership_generation FROM ll_quote_member_generations WHERE email=NEW.created_by AND org_id=NEW.org_id;
 SELECT generation INTO NEW.manager_membership_generation FROM ll_quote_member_generations WHERE email=NEW.plan->>'approver' AND org_id=NEW.org_id;
 IF NEW.requester_membership_generation IS NULL OR NEW.manager_membership_generation IS NULL
 THEN RAISE EXCEPTION 'Quote membership history unavailable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_00_quote_plan_membership_insert BEFORE INSERT ON ll_quote_plans
 FOR EACH ROW EXECUTE FUNCTION ll_quote_plan_membership_insert();
CREATE FUNCTION ll_quote_plan_membership_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.requester_membership_generation IS DISTINCT FROM OLD.requester_membership_generation
 OR NEW.manager_membership_generation IS DISTINCT FROM OLD.manager_membership_generation
 THEN RAISE EXCEPTION 'Saved quote membership history cannot be rewritten' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_plan_membership_immutable BEFORE UPDATE ON ll_quote_plans
 FOR EACH ROW EXECUTE FUNCTION ll_quote_plan_membership_immutable();
