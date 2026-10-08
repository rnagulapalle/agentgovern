-- Migration 13: fixed, immutable record routing for compatible Temporal workers.
-- Existing private-twin-1 ownership and history remain unchanged.
ALTER TABLE ll_temporal_dispatch DROP CONSTRAINT ll_temporal_dispatch_connector_version_check;
ALTER TABLE ll_temporal_dispatch ADD CONSTRAINT ll_temporal_dispatch_connector_version_check
 CHECK(connector_version IN ('private-twin-1','private-record-twin-2'));
CREATE TABLE ll_temporal_record_routes (
 org_id text NOT NULL, plan_id uuid NOT NULL, scope_id uuid NOT NULL,
 worker_build_id text NOT NULL CHECK(worker_build_id ~ '^ack-[a-f0-9]{64}$'),
 scope_version integer NOT NULL CHECK(scope_version>0),
 binding_id text NOT NULL CHECK(binding_id ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(org_id,plan_id),
 FOREIGN KEY(org_id,plan_id) REFERENCES ll_temporal_dispatch(org_id,plan_id),
 FOREIGN KEY(org_id,scope_id) REFERENCES ll_connector_scopes(org_id,id)
);
CREATE TRIGGER ll_temporal_record_route_immutable BEFORE UPDATE OR DELETE ON ll_temporal_record_routes
 FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
