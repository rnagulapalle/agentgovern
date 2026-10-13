-- Additive migration27. Preserve released14 and reuse its admission/drain fence.
-- This grants no role, registers no build, and rewrites no historical route.
ALTER TABLE ll_temporal_worker_builds DROP CONSTRAINT ll_temporal_worker_builds_worker_build_id_check;
ALTER TABLE ll_temporal_worker_builds ADD CONSTRAINT ll_temporal_worker_builds_worker_build_id_check
 CHECK(worker_build_id ~ '^(ack|quote)-[a-f0-9]{64}$');
CREATE TRIGGER ll_quote_worker_admission BEFORE INSERT ON ll_quote_background_routes
 FOR EACH ROW EXECUTE FUNCTION ll_record_worker_admission();
