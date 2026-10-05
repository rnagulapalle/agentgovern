CREATE TABLE ll_workflow_runs (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused','completed')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id)
);
CREATE TABLE ll_workflow_steps (
 org_id text NOT NULL, run_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal IN (1,2)),
 action_id uuid NOT NULL, agent_id text NOT NULL, connector text NOT NULL CHECK(connector IN ('crm','email')),
 payload jsonb NOT NULL, PRIMARY KEY(org_id,run_id,ordinal), UNIQUE(org_id,action_id),
 FOREIGN KEY(org_id,run_id) REFERENCES ll_workflow_runs(org_id,id),
 FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
CREATE TABLE ll_workflow_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL, run_id uuid NOT NULL,
 kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,run_id) REFERENCES ll_workflow_runs(org_id,id)
);
CREATE TRIGGER ll_workflow_events_append_only BEFORE UPDATE OR DELETE ON ll_workflow_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
CREATE TABLE ll_workflow_agents (
 org_id text NOT NULL, agent_id text NOT NULL, PRIMARY KEY(org_id,agent_id),
 FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
