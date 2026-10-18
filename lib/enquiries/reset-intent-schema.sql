-- Migration 15: optional offline completed-run reset intents, never automatic retry.
CREATE TABLE ll_temporal_reset_intents (
 org_id text NOT NULL, operation_id uuid NOT NULL, plan_id uuid NOT NULL,
 namespace text NOT NULL CHECK(namespace ~ '^[a-zA-Z0-9_-]{1,100}$'),
 workflow_id text NOT NULL, original_run_id uuid NOT NULL,
 task_finish_event_id bigint NOT NULL CHECK(task_finish_event_id>0),
 original_history_sha256 text NOT NULL CHECK(original_history_sha256 ~ '^[a-f0-9]{64}$'),
 worker_build_id text NOT NULL CHECK(worker_build_id ~ '^ack-[a-f0-9]{64}$'),
 image_id text NOT NULL CHECK(image_id ~ '^sha256:[a-f0-9]{64}$'),
 recovery_epoch uuid NOT NULL,
 state text NOT NULL DEFAULT 'uncertain' CHECK(state IN ('uncertain','observed')),
 reset_run_id uuid, reset_history_sha256 text, observed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,operation_id), UNIQUE(org_id,plan_id,original_run_id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_temporal_record_routes(org_id,plan_id),
 FOREIGN KEY(worker_build_id) REFERENCES ll_temporal_worker_builds(worker_build_id),
 CHECK ((state='uncertain' AND reset_run_id IS NULL AND reset_history_sha256 IS NULL AND observed_at IS NULL)
 OR (state='observed' AND reset_run_id IS NOT NULL AND reset_run_id<>original_run_id
 AND reset_history_sha256 IS NOT NULL AND reset_history_sha256 ~ '^[a-f0-9]{64}$' AND observed_at IS NOT NULL))
);
CREATE FUNCTION ll_reset_intent_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_epoch uuid; route_build text; route_workflow text; route_state text;
 artifact_image text; completed_state text;
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Reset intent cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['state','reset_run_id','reset_history_sha256','observed_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','reset_run_id','reset_history_sha256','observed_at']) OR
     NOT (OLD.state='uncertain' AND NEW.state='observed') THEN
   RAISE EXCEPTION 'Reset identity is immutable; no retry transition exists' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.state<>'uncertain' THEN
  RAISE EXCEPTION 'A reset must persist uncertainty before dispatch' USING ERRCODE='23514';
 END IF;
 SELECT epoch INTO expected_epoch FROM ll_workspace_recovery WHERE org_id=NEW.org_id FOR SHARE;
 SELECT r.worker_build_id,d.workflow_id,d.state,w.state INTO route_build,route_workflow,route_state,completed_state
 FROM ll_temporal_record_routes r JOIN ll_temporal_dispatch d USING(org_id,plan_id)
 JOIN ll_workflow_runs w ON w.org_id=r.org_id AND w.id=r.plan_id
 WHERE r.org_id=NEW.org_id AND r.plan_id=NEW.plan_id;
 SELECT image_id INTO artifact_image FROM ll_temporal_worker_builds WHERE worker_build_id=NEW.worker_build_id FOR SHARE;
 IF expected_epoch IS DISTINCT FROM NEW.recovery_epoch OR route_build IS DISTINCT FROM NEW.worker_build_id
 OR route_workflow IS DISTINCT FROM NEW.workflow_id OR route_state IS DISTINCT FROM 'started'
 OR completed_state IS DISTINCT FROM 'completed' OR artifact_image IS DISTINCT FROM NEW.image_id THEN
  RAISE EXCEPTION 'Reset intent lacks current recovery, route or retained artifact evidence' USING ERRCODE='23514';
 END IF;
 -- Draining is permitted only for this existing pinned route; nothing admits new work.
 RETURN NEW;
END $$;
CREATE TRIGGER ll_reset_intent_boundary BEFORE INSERT OR UPDATE OR DELETE ON ll_temporal_reset_intents
 FOR EACH ROW EXECUTE FUNCTION ll_reset_intent_boundary();
REVOKE ALL ON ll_temporal_reset_intents FROM PUBLIC;
-- No runtime mutation grants, lease expiry, requeue, route rewrite or artifact deletion.
