-- Migration 19: immutable distributor quote proposals only. No execution authority.
CREATE TABLE ll_quote_plans (
 org_id text NOT NULL REFERENCES ll_orgs(id),
 id uuid NOT NULL,
 created_by text NOT NULL REFERENCES ll_members(email),
 recovery_epoch uuid NOT NULL,
 proposal jsonb NOT NULL CHECK(jsonb_typeof(proposal)='object'),
 proposal_hash text NOT NULL CHECK(proposal_hash ~ '^[a-f0-9]{64}$'),
 plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object'),
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
 quote_action_id uuid NOT NULL,
 message_action_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id),
 CHECK(id<>quote_action_id AND id<>message_action_id AND quote_action_id<>message_action_id),
 CHECK(coalesce((proposal->>'planId')::uuid=id AND (plan->>'planId')::uuid=id,false)),
 CHECK(coalesce(proposal->>'workspaceId'=org_id AND plan->>'workspaceId'=org_id,false)),
 CHECK(coalesce(proposal->>'requester'=created_by AND plan->>'requester'=created_by,false)),
 CHECK(coalesce(proposal->>'version'='distributor-quote-plan-1' AND plan->>'version'='distributor-quote-plan-1',false)),
 CHECK(coalesce((proposal->'update'->>'actionId')::uuid=quote_action_id AND (plan->'update'->>'actionId')::uuid=quote_action_id,false)),
 CHECK(coalesce((proposal->'message'->>'actionId')::uuid=message_action_id AND (plan->'message'->>'actionId')::uuid=message_action_id,false)),
 CHECK(coalesce(plan->'quote'=proposal->'quote' AND plan->'policyVersion'=proposal->'policyVersion' AND
  plan->'discountBps'=proposal->'discountBps' AND plan->'approver'=proposal->'approver',false)),
 CHECK(coalesce(plan->>'approver'<>created_by AND plan->>'decision'='independent-review-required',false)),
 CHECK(coalesce(plan->'update'->'approvalRequired'='true'::jsonb AND plan->'message'->'approvalRequired'='true'::jsonb,false)),
 CHECK(coalesce((plan->'message'->'dependency'->>'actionId')::uuid=quote_action_id AND
  plan->'message'->'dependency'->>'requirement'='verified-matching-quote-effect',false)),
 CHECK(proposal ?& ARRAY['version','planId','workspaceId','requester','approver','policyVersion','quote','discountBps','update','message']),
 CHECK(plan ?& ARRAY['version','planId','workspaceId','requester','approver','policyVersion','quote','discountBps','totalMinor','decision','reason','policy','update','message'])
);
CREATE INDEX ll_quote_plans_owner ON ll_quote_plans(org_id,created_by,created_at DESC);
CREATE FUNCTION ll_quote_plan_insert_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM ll_orgs WHERE id=NEW.org_id FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM ll_members WHERE email=NEW.created_by AND org_id=NEW.org_id AND active=true) THEN
  RAISE EXCEPTION 'Quote proposal needs an active workspace member';
 END IF;
 -- Membership is an additional freshness condition, not a capability grant.
 IF NEW.plan->>'approver'=NEW.created_by OR NOT EXISTS (
  SELECT 1 FROM ll_members WHERE email=NEW.plan->>'approver' AND org_id=NEW.org_id AND active=true
 ) THEN
  RAISE EXCEPTION 'Quote proposal needs a current independent workspace reviewer';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM ll_workspace_recovery WHERE org_id=NEW.org_id AND epoch=NEW.recovery_epoch) THEN
  RAISE EXCEPTION 'Quote proposal needs the current enrolled recovery epoch';
 END IF;
 IF EXISTS (SELECT 1 FROM ll_quote_plans WHERE org_id=NEW.org_id AND
  (id IN (NEW.quote_action_id,NEW.message_action_id) OR
   quote_action_id IN (NEW.id,NEW.quote_action_id,NEW.message_action_id) OR
   message_action_id IN (NEW.id,NEW.quote_action_id,NEW.message_action_id))) THEN
  RAISE EXCEPTION 'Quote proposal action identity already belongs to saved work';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_quote_plan_insert BEFORE INSERT ON ll_quote_plans
 FOR EACH ROW EXECUTE FUNCTION ll_quote_plan_insert_boundary();
CREATE FUNCTION ll_quote_plan_no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Saved quote proposals cannot be rewritten or deleted'; END $$;
CREATE TRIGGER ll_quote_plan_immutable BEFORE UPDATE OR DELETE ON ll_quote_plans
 FOR EACH ROW EXECUTE FUNCTION ll_quote_plan_no_mutation();
CREATE TRIGGER ll_quote_plan_no_truncate BEFORE TRUNCATE ON ll_quote_plans
 FOR EACH STATEMENT EXECUTE FUNCTION ll_quote_plan_no_mutation();
