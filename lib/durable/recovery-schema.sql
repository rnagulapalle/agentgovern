-- Migration 10: deployment-owned restore fence and append-only recovery record.
CREATE TABLE ll_workspace_recovery (
 org_id text PRIMARY KEY REFERENCES ll_orgs(id), epoch uuid NOT NULL
);
CREATE TABLE ll_workspace_recovery_events (
 org_id text NOT NULL REFERENCES ll_orgs(id), epoch uuid NOT NULL,
 backup_hash text NOT NULL CHECK(backup_hash ~ '^[0-9a-f]{64}$'),
 at timestamptz NOT NULL DEFAULT now(), counts jsonb NOT NULL,
 PRIMARY KEY(org_id,epoch)
);
CREATE TRIGGER ll_workspace_recovery_append_only BEFORE UPDATE OR DELETE ON ll_workspace_recovery_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
