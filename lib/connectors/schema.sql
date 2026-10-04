CREATE TABLE ll_connector_policies (
 org_id text NOT NULL REFERENCES ll_orgs(id), connector text NOT NULL CHECK(connector IN ('crm','email')),
 version integer NOT NULL DEFAULT 1, active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(org_id,connector)
);
CREATE TABLE ll_connector_actions (
 org_id text NOT NULL REFERENCES ll_orgs(id), id uuid NOT NULL, agent_id text NOT NULL,
 connector text NOT NULL, payload jsonb NOT NULL, payload_hash text NOT NULL, policy_version integer NOT NULL,
 state text NOT NULL CHECK(state IN ('held','ready','executing','succeeded','uncertain','conflict','rejected','cancelled')),
 reason text NOT NULL, proposed_by text NOT NULL, approved_by text, approval_until timestamptz,
 lease_token uuid, lease_until timestamptz, evidence jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id), FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id),
 FOREIGN KEY(org_id,connector) REFERENCES ll_connector_policies(org_id,connector)
);
CREATE TABLE ll_connector_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, org_id text NOT NULL,
 action_id uuid NOT NULL, kind text NOT NULL, subject text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,action_id) REFERENCES ll_connector_actions(org_id,id)
);
CREATE TRIGGER ll_connector_events_append_only BEFORE UPDATE OR DELETE ON ll_connector_events
FOR EACH ROW EXECUTE FUNCTION ll_no_event_mutation();
ALTER TABLE ll_agent_profiles DROP CONSTRAINT ll_agent_profiles_role_check;
ALTER TABLE ll_agent_profiles ADD CHECK(role IN ('discount_agent','refund_agent','crm_agent','email_agent'));
ALTER TABLE ll_agent_profiles DROP CONSTRAINT ll_agent_profiles_connector_check;
ALTER TABLE ll_agent_profiles ADD CHECK(connector IN ('discount_record','refund_twin','crm_twin','email_twin'));
