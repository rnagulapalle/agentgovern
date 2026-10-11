-- Migration 23: opt-in historical membership fencing for existing CRM/email actions.
-- No identities, approvals, action IDs or historical proposals are rebound.
ALTER TABLE ll_connector_actions ADD COLUMN membership_proposal jsonb;
ALTER TABLE ll_connector_actions ADD COLUMN membership_approval jsonb;
ALTER TABLE ll_enquiry_plans ADD COLUMN membership_owner jsonb;
CREATE FUNCTION ll_membership_authority23() RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE FUNCTION ll_member_snapshot23(workspace text, subject text, legacy_role text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m ll_members%ROWTYPE; g bigint; BEGIN
 PERFORM id FROM ll_orgs WHERE id=workspace FOR UPDATE NOWAIT;
 SELECT * INTO m FROM ll_members WHERE email=subject FOR SHARE NOWAIT;
 IF FOUND THEN
  IF m.org_id<>workspace OR NOT m.active THEN RAISE EXCEPTION 'Current named membership required' USING ERRCODE='23514'; END IF;
  SELECT generation INTO g FROM ll_quote_member_generations WHERE email=subject AND org_id=workspace;
  IF g IS NULL OR g<=0 THEN RAISE EXCEPTION 'Membership history unavailable' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('kind','member','subject',subject,'generation',g::text);
 END IF;
 IF legacy_role IS NULL OR NOT EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=workspace AND t.subject=ll_member_snapshot23.subject AND t.role=legacy_role AND t.active=true)
 THEN RAISE EXCEPTION 'Explicit legacy identity required' USING ERRCODE='23514'; END IF;
 RETURN jsonb_build_object('kind','legacy','subject',subject,'role',legacy_role);
END $$;
CREATE FUNCTION ll_enquiry_membership_insert23() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.membership_owner IS NOT NULL THEN RAISE EXCEPTION 'Membership snapshot is server-owned' USING ERRCODE='23514'; END IF;
 NEW.membership_owner=ll_member_snapshot23(NEW.org_id,NEW.created_by,'operator');
 RETURN NEW;
END $$;
CREATE TRIGGER ll_00_enquiry_membership_insert23 BEFORE INSERT ON ll_enquiry_plans FOR EACH ROW EXECUTE FUNCTION ll_enquiry_membership_insert23();
CREATE FUNCTION ll_connector_membership_insert23() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner text; owner_snapshot jsonb; p ll_enquiry_plans%ROWTYPE; requester jsonb; BEGIN
 IF NEW.membership_proposal IS NOT NULL OR NEW.membership_approval IS NOT NULL OR NEW.approved_by IS NOT NULL THEN
  RAISE EXCEPTION 'Membership authority is server-owned' USING ERRCODE='23514'; END IF;
 requester=ll_member_snapshot23(NEW.org_id,NEW.proposed_by,CASE WHEN NEW.proposed_by=NEW.agent_id THEN 'agent' ELSE 'operator' END);
 SELECT ap.owner INTO owner FROM ll_agent_profiles ap WHERE ap.org_id=NEW.org_id AND ap.agent_id=NEW.agent_id;
 IF FOUND THEN owner_snapshot=ll_member_snapshot23(NEW.org_id,owner,NULL); END IF;
 SELECT ep.* INTO p FROM ll_enquiry_plans ep JOIN ll_workflow_steps s ON s.org_id=ep.org_id AND s.run_id=ep.run_id WHERE s.org_id=NEW.org_id AND s.action_id=NEW.id;
 IF FOUND THEN
  IF p.membership_owner IS NULL OR p.membership_owner IS DISTINCT FROM ll_member_snapshot23(NEW.org_id,p.created_by,'operator')
  THEN RAISE EXCEPTION 'Saved enquiry membership changed' USING ERRCODE='23514'; END IF;
 END IF;
 NEW.membership_proposal=jsonb_build_object('version',1,'requester',requester,'owner',owner_snapshot,'planOwner',p.membership_owner,'planId',p.id);
 RETURN NEW;
END $$;
CREATE TRIGGER ll_00_connector_membership_insert23 BEFORE INSERT ON ll_connector_actions FOR EACH ROW EXECUTE FUNCTION ll_connector_membership_insert23();
CREATE FUNCTION ll_connector_membership_approval23() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb; BEGIN
 IF NEW.membership_approval IS DISTINCT FROM OLD.membership_approval THEN RAISE EXCEPTION 'Approval membership is server-owned' USING ERRCODE='23514'; END IF;
 IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
  IF NEW.approved_by IS NULL THEN RETURN NEW; END IF;
  IF OLD.approved_by IS NOT NULL OR OLD.membership_approval IS NOT NULL OR OLD.state<>'held' OR OLD.membership_proposal IS NULL
  THEN RAISE EXCEPTION 'Historical approval cannot be rebound' USING ERRCODE='23514'; END IF;
  IF OLD.membership_proposal->'requester' IS DISTINCT FROM ll_member_snapshot23(NEW.org_id,OLD.proposed_by,OLD.membership_proposal->'requester'->>'role')
  THEN RAISE EXCEPTION 'Requester membership changed' USING ERRCODE='23514'; END IF;
  IF OLD.membership_proposal->'owner'<>'null'::jsonb AND OLD.membership_proposal->'owner' IS DISTINCT FROM ll_member_snapshot23(NEW.org_id,OLD.membership_proposal->'owner'->>'subject',NULL)
  THEN RAISE EXCEPTION 'Owner membership changed' USING ERRCODE='23514'; END IF;
  IF OLD.membership_proposal->'planOwner'<>'null'::jsonb AND OLD.membership_proposal->'planOwner' IS DISTINCT FROM ll_member_snapshot23(NEW.org_id,OLD.membership_proposal->'planOwner'->>'subject',OLD.membership_proposal->'planOwner'->>'role')
  THEN RAISE EXCEPTION 'Plan membership changed' USING ERRCODE='23514'; END IF;
  snapshot=ll_member_snapshot23(NEW.org_id,NEW.approved_by,'operator');
  IF NEW.approved_by=OLD.membership_proposal->'requester'->>'subject' OR NEW.approved_by=OLD.membership_proposal->'owner'->>'subject' OR NEW.approved_by=OLD.membership_proposal->'planOwner'->>'subject'
  THEN RAISE EXCEPTION 'Independent approval required' USING ERRCODE='23514'; END IF;
  NEW.membership_approval=jsonb_build_object('version',1,'approver',snapshot,'payloadHash',OLD.payload_hash,'policyVersion',OLD.policy_version);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_00_connector_membership_approval23 BEFORE UPDATE ON ll_connector_actions FOR EACH ROW EXECUTE FUNCTION ll_connector_membership_approval23();
-- Extend only the connector operational allowlist; proposal membership remains immutable.
DROP TRIGGER ll_connector_proposal_boundary ON ll_connector_actions;
CREATE TRIGGER ll_connector_proposal_boundary BEFORE UPDATE OR DELETE ON ll_connector_actions FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('state','reason','approved_by','approval_until','lease_token','lease_until','evidence','membership_approval');
