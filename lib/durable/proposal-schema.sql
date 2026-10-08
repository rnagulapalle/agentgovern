-- Migration 11: freeze persisted proposals; operational state remains mutable.
-- No existing proposals, approvals, IDs or payloads are rewritten.
CREATE FUNCTION ll_proposal_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Persisted proposal cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF (to_jsonb(NEW)-COALESCE(TG_ARGV,ARRAY[]::text[])) IS DISTINCT FROM (to_jsonb(OLD)-COALESCE(TG_ARGV,ARRAY[]::text[])) THEN
  RAISE EXCEPTION 'Persisted proposal cannot be rewritten' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_action_proposal_boundary BEFORE UPDATE OR DELETE ON ll_actions
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('state','reason','approved_by','approval_until','lease_token','lease_until');
CREATE TRIGGER ll_refund_proposal_boundary BEFORE UPDATE OR DELETE ON ll_refund_actions
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('state','reason','approved_by','approval_until','lease_token','lease_until','provider_id','provider_status');
CREATE TRIGGER ll_connector_proposal_boundary BEFORE UPDATE OR DELETE ON ll_connector_actions
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('state','reason','approved_by','approval_until','lease_token','lease_until','evidence');
CREATE TRIGGER ll_workflow_step_boundary BEFORE UPDATE OR DELETE ON ll_workflow_steps
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary();
CREATE TRIGGER ll_workflow_run_boundary BEFORE UPDATE OR DELETE ON ll_workflow_runs
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('state');
CREATE TRIGGER ll_effect_boundary BEFORE UPDATE OR DELETE ON ll_effects
FOR EACH ROW EXECUTE FUNCTION ll_proposal_boundary('recovered');
