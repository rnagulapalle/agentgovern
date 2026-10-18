-- PROPOSED additive quote action/workflow admission. No released migration number.
-- No historical action, approval, identity or workflow is upgraded.
ALTER TABLE ll_connector_policies DROP CONSTRAINT ll_connector_policies_connector_check;
ALTER TABLE ll_connector_policies ADD CHECK(connector IN ('crm','email','quote'));
ALTER TABLE ll_agent_profiles DROP CONSTRAINT ll_agent_profiles_role_check;
ALTER TABLE ll_agent_profiles ADD CHECK(role IN ('discount_agent','refund_agent','crm_agent','email_agent','quote_agent'));
ALTER TABLE ll_agent_profiles DROP CONSTRAINT ll_agent_profiles_connector_check;
ALTER TABLE ll_agent_profiles ADD CHECK(connector IN ('discount_record','refund_twin','crm_twin','email_twin','quote_twin'));
CREATE FUNCTION ll_quote_action_boundary_proposed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p ll_quote_plans%ROWTYPE; saved_part jsonb; authority jsonb; scope_version integer; grant_version integer; expected jsonb;
BEGIN
 IF NEW.connector<>'quote' AND NEW.payload->>'contract' IS DISTINCT FROM 'quote-step-1' THEN RETURN NEW; END IF;
 IF NEW.payload->>'contract' IS DISTINCT FROM 'quote-step-1' OR NEW.payload->>'step' NOT IN ('update','message') OR NEW.payload->>'step' IS NULL THEN
  RAISE EXCEPTION 'Exact saved quote step required' USING ERRCODE='23514'; END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE NOWAIT;
 SELECT * INTO p FROM ll_quote_plans WHERE org_id=NEW.org_id AND id=(NEW.payload->>'planId')::uuid;
 IF NOT FOUND OR p.plan->>'version'<>'distributor-quote-plan-2' OR p.plan_hash IS DISTINCT FROM NEW.payload->>'planHash' OR p.created_by<>NEW.proposed_by OR p.plan->>'requester'<>NEW.proposed_by THEN
  RAISE EXCEPTION 'Exact saved quote plan required' USING ERRCODE='23514'; END IF;
 authority=p.plan->'authority';
 IF NOT EXISTS(SELECT 1 FROM ll_workspace_recovery WHERE org_id=NEW.org_id AND epoch=p.recovery_epoch AND epoch::text=authority->>'recoveryEpoch')
 OR p.requester_membership_generation IS DISTINCT FROM (SELECT generation FROM ll_quote_member_generations WHERE org_id=NEW.org_id AND email=p.created_by)
 OR p.manager_membership_generation IS DISTINCT FROM (SELECT generation FROM ll_quote_member_generations WHERE org_id=NEW.org_id AND email=p.plan->>'approver')
 OR (SELECT count(*) FROM ll_members WHERE org_id=NEW.org_id AND email IN (p.created_by,p.plan->>'approver') AND active=true)<>2 THEN
  RAISE EXCEPTION 'Quote membership or recovery changed' USING ERRCODE='23514'; END IF;
 SELECT version INTO scope_version FROM ll_connector_scopes WHERE org_id=NEW.org_id AND id=(authority->>'scopeId')::uuid AND contract_version='private-quote-twin-1' AND active=true;
 IF scope_version IS DISTINCT FROM (authority->>'scopeVersion')::integer OR NOT EXISTS(SELECT 1 FROM ll_quote_manager_grants WHERE org_id=NEW.org_id AND scope_id=(authority->>'scopeId')::uuid AND member=p.plan->>'approver' AND policy_version=(p.plan->>'policyVersion')::integer AND version=(authority->>'grantVersion')::integer AND active=true) THEN
  RAISE EXCEPTION 'Quote enrolled authority changed' USING ERRCODE='23514'; END IF;
 saved_part=CASE WHEN NEW.payload->>'step'='update' THEN p.plan->'update' ELSE p.plan->'message' END;
 SELECT g.version INTO grant_version FROM ll_connector_scope_grants g JOIN ll_agent_profiles ap ON ap.org_id=g.org_id AND ap.agent_id=g.agent_id WHERE g.org_id=NEW.org_id AND g.scope_id=(authority->>'scopeId')::uuid AND g.agent_id=NEW.agent_id AND g.active=true AND ap.owner=p.created_by;
 IF grant_version IS NULL OR NOT EXISTS(SELECT 1 FROM ll_agents a JOIN ll_connector_policies policy ON policy.org_id=a.org_id AND policy.connector=NEW.connector WHERE a.org_id=NEW.org_id AND a.id=NEW.agent_id AND a.active=true AND ('twin.'||NEW.connector)=ANY(a.tools) AND policy.active=true AND policy.version=NEW.policy_version AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true)) THEN RAISE EXCEPTION 'Exact current quote agent, policy and grant required' USING ERRCODE='23514'; END IF;
 expected=jsonb_build_object('contract','quote-step-1','planId',p.plan->>'planId','planHash',p.plan_hash,'step',NEW.payload->>'step','quoteRequest',saved_part->'request','binding',saved_part->'request'->>'binding','scopeGrant',jsonb_build_object('scopeId',authority->>'scopeId','scopeVersion',scope_version,'grantVersion',grant_version));
 IF NEW.payload IS DISTINCT FROM expected OR NEW.id::text<>saved_part->>'actionId' OR NEW.agent_id<>saved_part->>'agentId' OR NEW.policy_version<>(p.plan->>'policyVersion')::integer OR NEW.connector IS DISTINCT FROM (CASE WHEN NEW.payload->>'step'='update' THEN 'quote' ELSE 'email' END) THEN
  RAISE EXCEPTION 'Saved quote request cannot be rebound' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'held' OR NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Quote actions require independent review' USING ERRCODE='23514'; END IF;
 ELSIF NEW.approved_by IS DISTINCT FROM OLD.approved_by AND NEW.approved_by IS NOT NULL THEN
  IF NEW.approval_until IS NULL OR NEW.approval_until<=clock_timestamp() OR NEW.approval_until>clock_timestamp()+interval '15 minutes' THEN RAISE EXCEPTION 'Quote approval must expire within15minutes' USING ERRCODE='23514'; END IF;
  IF NEW.approved_by<>p.plan->>'approver' OR NEW.approved_by=p.created_by THEN RAISE EXCEPTION 'Designated independent quote manager required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_01_quote_action_insert_proposed BEFORE INSERT ON ll_connector_actions FOR EACH ROW EXECUTE FUNCTION ll_quote_action_boundary_proposed();
-- Run only when approval identity changes, so containment/uncertainty may still
-- revoke actions after source/member/scope authority is no longer current.
CREATE FUNCTION ll_quote_approval_expiry_proposed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.connector='quote' OR NEW.payload->>'contract'='quote-step-1') AND OLD.approved_by IS NOT NULL AND NEW.approval_until IS DISTINCT FROM OLD.approval_until AND NEW.approval_until IS NOT NULL THEN RAISE EXCEPTION 'Quote approval expiry cannot be extended or rebound' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_approval_expiry_proposed BEFORE UPDATE OF approval_until ON ll_connector_actions FOR EACH ROW EXECUTE FUNCTION ll_quote_approval_expiry_proposed();
CREATE TRIGGER ll_01_quote_action_approval_proposed BEFORE UPDATE OF approved_by ON ll_connector_actions FOR EACH ROW WHEN (NEW.approved_by IS DISTINCT FROM OLD.approved_by AND NEW.approved_by IS NOT NULL) EXECUTE FUNCTION ll_quote_action_boundary_proposed();
-- PROPOSED unnumbered additive section; combine with connector quote schema.
-- Creation binds saved proposals only; it grants no approval/dispatch authority.
ALTER TABLE ll_workflow_runs ADD COLUMN workflow_kind text NOT NULL DEFAULT 'customer-acknowledgement';
ALTER TABLE ll_workflow_runs ADD COLUMN workflow_version integer NOT NULL DEFAULT 1;
ALTER TABLE ll_workflow_runs ADD COLUMN quote_plan_id uuid;
ALTER TABLE ll_workflow_runs ADD COLUMN quote_plan_hash text;
ALTER TABLE ll_workflow_runs ADD CONSTRAINT ll_workflow_kind_version CHECK (
 (workflow_kind='customer-acknowledgement' AND workflow_version=1 AND quote_plan_id IS NULL AND quote_plan_hash IS NULL) OR
 (workflow_kind='distributor-quote' AND workflow_version=1 AND quote_plan_id IS NOT NULL AND id=quote_plan_id
  AND quote_plan_hash IS NOT NULL AND quote_plan_hash ~ '^[a-f0-9]{64}$'));
ALTER TABLE ll_workflow_runs ADD FOREIGN KEY(org_id,quote_plan_id) REFERENCES ll_quote_plans(org_id,id);
ALTER TABLE ll_workflow_steps DROP CONSTRAINT ll_workflow_steps_connector_check;
ALTER TABLE ll_workflow_steps ADD CONSTRAINT ll_workflow_steps_connector_check CHECK(connector IN('crm','email','quote'));
ALTER TABLE ll_workflow_steps ADD COLUMN dependency_action_id uuid;
ALTER TABLE ll_workflow_steps ADD FOREIGN KEY(org_id,dependency_action_id) REFERENCES ll_workflow_steps(org_id,action_id);
CREATE FUNCTION ll_quote_workflow_run_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p ll_quote_plans%ROWTYPE; a jsonb; BEGIN
 IF NEW.workflow_kind<>'distributor-quote' THEN RETURN NEW; END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE NOWAIT;
 SELECT * INTO p FROM ll_quote_plans WHERE org_id=NEW.org_id AND id=NEW.quote_plan_id;
 IF NOT FOUND OR p.plan->>'version'<>'distributor-quote-plan-2' OR NEW.created_by<>p.created_by OR NEW.quote_plan_hash<>p.plan_hash
 THEN RAISE EXCEPTION 'Workflow requires the exact saved bound quote plan' USING ERRCODE='23514'; END IF;
 a:=p.plan->'authority';
 PERFORM email FROM ll_members WHERE org_id=NEW.org_id AND email IN(p.created_by,p.plan->>'approver') AND active=true FOR SHARE NOWAIT;
 IF NOT EXISTS(
 SELECT 1 FROM ll_connector_scopes s JOIN ll_quote_manager_grants g ON g.org_id=s.org_id AND g.scope_id=s.id
 JOIN ll_members m ON m.email=g.member AND m.org_id=g.org_id AND m.active=true
 JOIN ll_members o ON o.email=p.created_by AND o.org_id=p.org_id AND o.active=true
 JOIN ll_quote_member_generations mg ON mg.email=m.email AND mg.org_id=m.org_id
 JOIN ll_quote_member_generations og ON og.email=o.email AND og.org_id=o.org_id
 JOIN ll_workspace_recovery r ON r.org_id=s.org_id
 WHERE s.org_id=NEW.org_id AND s.id=(a->>'scopeId')::uuid AND s.active=true AND s.contract_version='private-quote-twin-1'
 AND s.version=(a->>'scopeVersion')::integer AND s.quote_id=a->>'quoteId' AND s.distributor_id=a->>'distributorId'
 AND s.recipient=a->>'recipient' AND s.sender=a->>'sender' AND s.binding_id=a->>'quoteBinding' AND s.email_binding_id=a->>'emailBinding'
 AND g.member=a->>'member' AND g.member<>p.created_by AND g.active=true AND g.policy_version=(a->>'policyVersion')::integer
 AND g.version=(a->>'grantVersion')::integer AND g.capability='quote.discount.approve'
 AND mg.generation=p.manager_membership_generation AND og.generation=p.requester_membership_generation
 AND r.epoch=p.recovery_epoch AND r.epoch=(a->>'recoveryEpoch')::uuid
 ) THEN RAISE EXCEPTION 'Saved quote workflow authority changed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_workflow_run_insert_boundary BEFORE INSERT ON ll_workflow_runs
 FOR EACH ROW EXECUTE FUNCTION ll_quote_workflow_run_insert_boundary();
CREATE FUNCTION ll_quote_workflow_step_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r ll_workflow_runs%ROWTYPE; p ll_quote_plans%ROWTYPE; s jsonb; expected jsonb; BEGIN
 SELECT * INTO r FROM ll_workflow_runs WHERE org_id=NEW.org_id AND id=NEW.run_id;
 IF r.workflow_kind='customer-acknowledgement' THEN
  IF NEW.connector='quote' OR NEW.dependency_action_id IS NOT NULL OR NEW.payload ? 'quoteRequest' OR NEW.payload ? 'contract'
  THEN RAISE EXCEPTION 'Acknowledgement workflow cannot contain a quote step' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF r.workflow_kind IS DISTINCT FROM 'distributor-quote' THEN RAISE EXCEPTION 'Supported workflow required' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM ll_quote_plans WHERE org_id=NEW.org_id AND id=r.quote_plan_id;
 s:=p.plan->(CASE WHEN NEW.ordinal=1 THEN 'update' ELSE 'message' END);
 expected:=jsonb_build_object('contract','quote-step-1','planId',p.id::text,'planHash',p.plan_hash,
 'step',CASE WHEN NEW.ordinal=1 THEN 'update' ELSE 'message' END,'quoteRequest',s->'request','binding',s->'request'->>'binding');
 IF NEW.action_id IS DISTINCT FROM (s->>'actionId')::uuid OR NEW.agent_id IS DISTINCT FROM s->>'agentId'
 OR NEW.connector IS DISTINCT FROM (CASE WHEN NEW.ordinal=1 THEN 'quote' ELSE 'email' END)
 OR NEW.payload IS DISTINCT FROM expected
 OR NEW.dependency_action_id IS DISTINCT FROM (CASE WHEN NEW.ordinal=2 THEN p.quote_action_id ELSE NULL END)
 THEN RAISE EXCEPTION 'Quote workflow step must match exact saved action and dependency' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_workflow_step_insert_boundary BEFORE INSERT ON ll_workflow_steps
 FOR EACH ROW EXECUTE FUNCTION ll_quote_workflow_step_insert_boundary();

-- PROPOSED final observation record only; no released migration number.
-- Existing append-only event trigger protects UPDATE/DELETE. This is unsigned
-- server/provider evidence; SQL cannot independently authenticate remote effects.
ALTER TABLE ll_workflow_events ADD COLUMN quote_verification jsonb;
CREATE UNIQUE INDEX ll_quote_verification_once ON ll_workflow_events(org_id,run_id)
 WHERE quote_verification IS NOT NULL;
CREATE FUNCTION ll_quote_verification_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r ll_workflow_runs%ROWTYPE; p ll_quote_plans%ROWTYPE; v jsonb; s jsonb; a ll_connector_actions%ROWTYPE; i integer; generation bigint;
BEGIN
 SELECT * INTO r FROM ll_workflow_runs WHERE org_id=NEW.org_id AND id=NEW.run_id;
 IF NEW.quote_verification IS NULL THEN
  IF r.workflow_kind='distributor-quote' AND NEW.kind='verified' THEN RAISE EXCEPTION 'Exact quote verification record required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE NOWAIT;
 v:=NEW.quote_verification;
 IF ll_runtime_classification() IS DISTINCT FROM 'web' OR r.workflow_kind IS DISTINCT FROM 'distributor-quote' OR r.state IS DISTINCT FROM 'completed' OR NEW.kind IS DISTINCT FROM 'verified'
 OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>10
 OR NOT v ?& ARRAY['contract','workspaceId','runId','planHash','quoteId','recoveryEpoch','verifiedBy','verifiedAt','steps','receiptHash']
 OR v->>'contract' IS DISTINCT FROM 'quote-verification-receipt-1' OR v->>'workspaceId' IS DISTINCT FROM NEW.org_id
 OR v->>'runId' IS DISTINCT FROM NEW.run_id::text OR v->>'verifiedBy' IS DISTINCT FROM NEW.subject
 OR v->>'receiptHash' IS NULL OR v->>'receiptHash' !~ '^[a-f0-9]{64}$'
 OR (v->>'verifiedAt')::timestamptz IS DISTINCT FROM NEW.at OR NEW.at>statement_timestamp() OR NEW.at<statement_timestamp()-interval '5 minutes'
 OR jsonb_typeof(v->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'steps')<>2
 THEN RAISE EXCEPTION 'Exact bounded named quote verification required' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM ll_quote_plans WHERE org_id=NEW.org_id AND id=r.quote_plan_id;
 IF NOT FOUND OR v->>'planHash' IS DISTINCT FROM p.plan_hash OR v->>'quoteId' IS DISTINCT FROM p.plan->'quote'->>'id'
 OR v->>'recoveryEpoch' IS DISTINCT FROM p.recovery_epoch::text OR NEW.subject NOT IN(p.created_by,p.plan->>'approver')
 OR NOT EXISTS(SELECT 1 FROM ll_workspace_recovery WHERE org_id=NEW.org_id AND epoch=p.recovery_epoch)
 THEN RAISE EXCEPTION 'Verification differs from exact saved quote' USING ERRCODE='23514'; END IF;
 SELECT g.generation INTO generation FROM ll_members m JOIN ll_quote_member_generations g ON g.org_id=m.org_id AND g.email=m.email WHERE m.org_id=NEW.org_id AND m.email=NEW.subject AND m.active=true;
 IF generation IS NULL OR generation IS DISTINCT FROM (CASE WHEN NEW.subject=p.created_by THEN p.requester_membership_generation ELSE p.manager_membership_generation END)
 THEN RAISE EXCEPTION 'Current exact named verifier required' USING ERRCODE='23514'; END IF;
 FOR i IN 0..1 LOOP
  s:=v->'steps'->i;
  SELECT a0.* INTO a FROM ll_workflow_steps ws JOIN ll_connector_actions a0 ON a0.org_id=ws.org_id AND a0.id=ws.action_id WHERE ws.org_id=NEW.org_id AND ws.run_id=NEW.run_id AND ws.ordinal=i+1;
  IF NOT FOUND OR jsonb_typeof(s) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(s))<>8
  OR NOT s ?& ARRAY['ordinal','actionId','binding','requestIdentity','payloadHash','effectDigest','providerReference','sourceAfter']
  OR s->>'ordinal' IS DISTINCT FROM (i+1)::text OR s->>'actionId' IS DISTINCT FROM a.id::text
  OR a.state IS DISTINCT FROM 'succeeded' OR a.evidence->>'outcome' IS DISTINCT FROM 'verified'
  OR s->>'providerReference' IS DISTINCT FROM a.evidence->>'reference' OR s->>'providerReference' IS NULL OR s->>'providerReference' !~ '^[A-Za-z0-9_-]{1,128}$'
  OR s->>'payloadHash' IS DISTINCT FROM a.payload_hash OR s->>'binding' IS DISTINCT FROM a.payload->>'binding'
  OR s->>'requestIdentity' IS NULL OR s->>'requestIdentity' !~ '^[a-f0-9]{64}$' OR s->>'effectDigest' IS NULL OR s->>'effectDigest' !~ '^[a-f0-9]{64}$'
  OR (i=0 AND (s->>'sourceAfter' IS NULL OR s->>'sourceAfter' !~ '^[A-Za-z0-9._:-]{1,128}$' OR s->>'sourceAfter'=p.plan->'update'->'request'->>'sourceVersion'))
  OR (i=1 AND s->'sourceAfter' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'Verification must bind two exact successful effects' USING ERRCODE='23514'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_verification_insert_boundary BEFORE INSERT ON ll_workflow_events
 FOR EACH ROW EXECUTE FUNCTION ll_quote_verification_insert_boundary();
