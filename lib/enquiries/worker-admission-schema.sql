-- Migration 14: opt-in, one-way admission fence for new record routes.
-- Existing routes/approvals are neither rewritten nor made dependent on enrollment.
CREATE TABLE ll_temporal_worker_builds (
 worker_build_id text PRIMARY KEY CHECK(worker_build_id ~ '^ack-[a-f0-9]{64}$'),
 image_id text NOT NULL CHECK(image_id ~ '^sha256:[a-f0-9]{64}$'),
 workflow_sha256 text NOT NULL CHECK(workflow_sha256 ~ '^[a-f0-9]{64}$'),
 service_sha256 text NOT NULL CHECK(service_sha256 ~ '^[a-f0-9]{64}$'),
 lock_sha256 text NOT NULL CHECK(lock_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','draining')),
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 draining_at timestamptz,
 CHECK ((state='active' AND draining_at IS NULL) OR (state='draining' AND draining_at IS NOT NULL))
);
CREATE FUNCTION ll_worker_admission_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR
    (to_jsonb(NEW)-ARRAY['state','draining_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','draining_at']) OR
    NOT (OLD.state='active' AND NEW.state='draining' AND NEW.draining_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Worker enrollment is immutable; only active to draining is allowed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_worker_admission_transition BEFORE UPDATE OR DELETE ON ll_temporal_worker_builds
 FOR EACH ROW EXECUTE FUNCTION ll_worker_admission_transition();
CREATE FUNCTION ll_record_worker_admission() RETURNS trigger LANGUAGE plpgsql
 SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE admitted text;
BEGIN
 -- SHARE conflicts with the drain UPDATE's row lock. Admission and drain therefore
 -- serialize at the same database boundary, including concurrent direct inserts.
 -- Row locks require UPDATE privilege. Keep that privilege with the owner, not
 -- the runtime: qualify the trigger's own schema and fix the definer search path.
 EXECUTE format('SELECT state FROM %I.ll_temporal_worker_builds WHERE worker_build_id=$1 FOR SHARE',TG_TABLE_SCHEMA)
  INTO admitted USING NEW.worker_build_id;
 IF admitted IS DISTINCT FROM 'active' THEN
  RAISE EXCEPTION 'Worker build is not accepting new routes' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION ll_record_worker_admission() FROM PUBLIC;
CREATE TRIGGER ll_record_worker_admission BEFORE INSERT ON ll_temporal_record_routes
 FOR EACH ROW EXECUTE FUNCTION ll_record_worker_admission();
-- No retired/deleted state: counts alone cannot authorize artifact/history removal.
