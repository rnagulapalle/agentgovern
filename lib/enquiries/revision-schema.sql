-- PROPOSED additive migration 24; NOT installed or released.
-- Requires installed membership-authority 23. A link is proposal history only.
CREATE FUNCTION ll_enquiry_revision24() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE TABLE ll_enquiry_revisions (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 parent_id uuid NOT NULL, successor_id uuid NOT NULL,
 parent_hash text NOT NULL CHECK(parent_hash ~ '^[a-f0-9]{64}$'),
 intent_hash text CHECK(intent_hash IS NULL OR intent_hash ~ '^[a-f0-9]{64}$'),
 change_hash text NOT NULL CHECK(change_hash ~ '^[a-f0-9]{64}$'),
 lifecycle text NOT NULL CHECK(lifecycle IN ('lead','customer')),
 PRIMARY KEY(org_id,parent_id), UNIQUE(org_id,successor_id), CHECK(parent_id<>successor_id),
 FOREIGN KEY(org_id,parent_id) REFERENCES ll_enquiry_plans(org_id,id),
 FOREIGN KEY(org_id,successor_id) REFERENCES ll_enquiry_plans(org_id,id)
);
CREATE FUNCTION ll_enquiry_revision_boundary24() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p ll_enquiry_plans%ROWTYPE; s ll_enquiry_plans%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Plan revision links are immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE NOWAIT;
 SELECT * INTO p FROM ll_enquiry_plans WHERE org_id=NEW.org_id AND id=NEW.parent_id;
 SELECT * INTO s FROM ll_enquiry_plans WHERE org_id=NEW.org_id AND id=NEW.successor_id;
 IF p.id IS NULL OR s.id IS NULL OR p.run_id IS NOT NULL OR s.run_id IS NOT NULL
 OR p.created_by IS DISTINCT FROM s.created_by OR p.plan_hash IS DISTINCT FROM NEW.parent_hash
 OR p.fixture_id<>'chat_ack_v1' OR s.fixture_id<>'chat_ack_v1'
 OR s.plan#>>'{crm,lifecycle}' IS DISTINCT FROM NEW.lifecycle
 OR p.membership_owner IS NULL OR p.membership_owner IS DISTINCT FROM ll_member_snapshot23(NEW.org_id,p.created_by,'operator')
 OR s.membership_owner IS DISTINCT FROM p.membership_owner
 OR EXISTS(WITH RECURSIVE ancestors(id) AS (
  SELECT parent_id FROM ll_enquiry_revisions WHERE org_id=NEW.org_id AND successor_id=NEW.parent_id
  UNION SELECT r.parent_id FROM ll_enquiry_revisions r JOIN ancestors a ON r.successor_id=a.id WHERE r.org_id=NEW.org_id
 ) SELECT 1 FROM ancestors WHERE id=NEW.successor_id)
 THEN RAISE EXCEPTION 'Current unsubmitted immutable parent and successor required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_enquiry_revision_boundary24 BEFORE INSERT OR UPDATE OR DELETE ON ll_enquiry_revisions FOR EACH ROW EXECUTE FUNCTION ll_enquiry_revision_boundary24();
CREATE FUNCTION ll_enquiry_leaf_submit24() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.run_id IS NULL AND NEW.run_id IS NOT NULL THEN
  PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE NOWAIT;
  IF EXISTS(SELECT 1 FROM ll_enquiry_revisions WHERE org_id=NEW.org_id AND parent_id=NEW.id)
  THEN RAISE EXCEPTION 'Superseded plan cannot be submitted' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_enquiry_leaf_submit24 BEFORE UPDATE ON ll_enquiry_plans FOR EACH ROW EXECUTE FUNCTION ll_enquiry_leaf_submit24();
CREATE TRIGGER ll_enquiry_revision_no_truncate24 BEFORE TRUNCATE ON ll_enquiry_revisions FOR EACH STATEMENT EXECUTE FUNCTION ll_quote_authority_no_truncate();

-- Explicit new representation; retained record-twin-2 ownership is unchanged.
DO $$ BEGIN
 IF to_regclass('ll_temporal_dispatch') IS NOT NULL THEN
  IF to_regclass('ll_temporal_record_routes') IS NULL THEN RAISE EXCEPTION 'Record routing13 prerequisite required'; END IF;
  ALTER TABLE ll_temporal_dispatch DROP CONSTRAINT ll_temporal_dispatch_connector_version_check;
  ALTER TABLE ll_temporal_dispatch ADD CONSTRAINT ll_temporal_dispatch_connector_version_check
   CHECK(connector_version IN ('private-twin-1','private-record-twin-2','private-record-twin-3'));
 END IF;
END $$;
