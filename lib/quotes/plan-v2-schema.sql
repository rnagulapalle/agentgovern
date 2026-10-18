-- Migration 21: versioned bound proposals only; no connector dispatch support.
DO $$ DECLARE boundary text; count_boundaries integer; BEGIN
 SELECT count(*),min(conname) INTO count_boundaries,boundary FROM pg_constraint
 WHERE conrelid='ll_quote_plans'::regclass AND contype='c'
 AND position('distributor-quote-plan-1' in pg_get_constraintdef(oid))>0;
 IF count_boundaries<>1 THEN RAISE EXCEPTION 'Expected retained quote proposal version boundary'; END IF;
 EXECUTE format('ALTER TABLE ll_quote_plans DROP CONSTRAINT %I',boundary);
END $$;
ALTER TABLE ll_quote_plans ADD CONSTRAINT ll_quote_plan_versions CHECK(coalesce(
 proposal->>'version'=plan->>'version' AND plan->>'version' IN ('distributor-quote-plan-1','distributor-quote-plan-2'),false));
ALTER TABLE ll_quote_plans ADD CONSTRAINT ll_quote_bound_plan CHECK (
 (plan->>'version'='distributor-quote-plan-1' AND NOT(plan ? 'authority') AND NOT(proposal ? 'authority')) OR
 (plan->>'version'='distributor-quote-plan-2' AND coalesce(
 jsonb_typeof(plan->'authority')='object' AND plan->'authority'=proposal->'authority'
 AND plan->'authority'->>'contract'='quote-authority-1'
 AND plan->'authority'->>'workspaceId'=org_id AND plan->'authority'->>'quoteId'=plan->'quote'->>'id'
 AND plan->'authority'->>'distributorId'=plan->'quote'->>'distributorId'
 AND plan->'authority'->>'member'=plan->>'approver' AND plan->'authority'->'policyVersion'=plan->'policyVersion'
 AND (plan->'authority'->>'recoveryEpoch')::uuid=recovery_epoch
 AND plan->'authority'->>'capability'='quote.discount.approve'
 AND plan->'authority'->>'quoteBinding'=plan->'update'->'request'->>'binding'
 AND plan->'authority'->>'emailBinding'=plan->'message'->'request'->>'binding'
 AND plan->'message'->'request'->>'contract'='quote-email-request-1'
 AND plan->'message'->'request'->>'workspaceId'=org_id
 AND plan->'message'->'request'->>'quoteId'=plan->'quote'->>'id'
 AND plan->'authority'->>'sender'=plan->'message'->'request'->'body'->>'from'
 AND plan->'message'->'request'->'body'->'to'=jsonb_build_array(plan->'authority'->>'recipient')
 AND plan->'authority'->>'recipient'=plan->'quote'->>'recipient'
 AND plan->'update'->'request'->>'contract'='quote-conditional-write-1'
 AND plan->'update'->'request'->>'method'='PATCH'
 AND plan->'update'->'request'->>'resource'='/quotes/'||(plan->'quote'->>'id')
 AND plan->'update'->'request'->>'workspaceId'=org_id
 AND plan->'update'->'request'->>'sourceVersion'=plan->'quote'->>'sourceVersion'
 AND (plan->'update'->'request'->>'idempotencyKey')::uuid=quote_action_id
 AND plan->'update'->'request'->'body'->'distributorId'=plan->'quote'->'distributorId'
 AND plan->'update'->'request'->'body'->'currency'=plan->'quote'->'currency'
 AND plan->'update'->'request'->'body'->'subtotalMinor'=plan->'quote'->'subtotalMinor'
 AND plan->'update'->'request'->'body'->'discountBps'=plan->'discountBps'
 AND plan->'update'->'request'->'body'->'totalMinor'=plan->'totalMinor'
 AND plan->'message'->'request'->>'method'='POST'
 AND plan->'message'->'request'->>'resource'='/emails'
 AND (plan->'message'->'request'->>'idempotencyKey')::uuid=message_action_id,false))
);
CREATE FUNCTION ll_quote_bound_plan_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a jsonb; BEGIN
 IF NEW.plan->>'version'<>'distributor-quote-plan-2' THEN RETURN NEW; END IF;
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
 a:=NEW.plan->'authority';
 IF jsonb_typeof(a)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>15
 OR NOT(a ?& ARRAY['contract','scopeId','scopeVersion','workspaceId','quoteId','distributorId','recipient','sender','quoteBinding','emailBinding','member','policyVersion','grantVersion','capability','recoveryEpoch'])
 OR NOT EXISTS(
  SELECT 1 FROM ll_connector_scopes s JOIN ll_quote_manager_grants g ON g.org_id=s.org_id AND g.scope_id=s.id
  JOIN ll_members m ON m.email=g.member AND m.org_id=g.org_id AND m.active=true
  JOIN ll_workspace_recovery r ON r.org_id=s.org_id
  WHERE s.org_id=NEW.org_id AND s.id=(a->>'scopeId')::uuid AND s.active=true
  AND s.contract_version='private-quote-twin-1' AND s.version=(a->>'scopeVersion')::integer
  AND s.quote_id=a->>'quoteId' AND s.distributor_id=a->>'distributorId'
  AND s.recipient=a->>'recipient' AND s.sender=a->>'sender'
  AND s.binding_id=a->>'quoteBinding' AND s.email_binding_id=a->>'emailBinding'
  AND g.member=a->>'member' AND g.member<>NEW.created_by AND g.active=true
  AND g.policy_version=(a->>'policyVersion')::integer AND g.version=(a->>'grantVersion')::integer
  AND g.capability='quote.discount.approve' AND r.epoch=NEW.recovery_epoch
  AND r.epoch=(a->>'recoveryEpoch')::uuid
 ) THEN RAISE EXCEPTION 'Bound quote proposal requires exact current enrolled scope, manager and recovery authority' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_plan_v2_current BEFORE INSERT ON ll_quote_plans
 FOR EACH ROW EXECUTE FUNCTION ll_quote_bound_plan_insert_boundary();
