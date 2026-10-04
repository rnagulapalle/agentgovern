CREATE TABLE ll_members (
 email text PRIMARY KEY, org_id text NOT NULL REFERENCES ll_orgs(id),
 name text NOT NULL, password_hash text NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE ll_sessions (
 hash text PRIMARY KEY, email text NOT NULL REFERENCES ll_members(email),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ll_sessions_member ON ll_sessions(email);
CREATE TABLE ll_access_attempts (
 key text PRIMARY KEY, count integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ll_agent_profiles (
 org_id text NOT NULL, agent_id text NOT NULL, name text NOT NULL,
 owner text NOT NULL, role text NOT NULL CHECK(role IN ('discount_agent','refund_agent')),
 connector text NOT NULL CHECK(connector IN ('discount_record','refund_twin')),
 PRIMARY KEY(org_id,agent_id), FOREIGN KEY(org_id,agent_id) REFERENCES ll_agents(org_id,id)
);
CREATE TABLE ll_sales_requests (
 id uuid PRIMARY KEY, org_id text NOT NULL DEFAULT 'local-proof' REFERENCES ll_orgs(id), email text NOT NULL, name text NOT NULL,
 company text NOT NULL, company_size text NOT NULL, role text NOT NULL,
 workflow text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION ll_runtime_agent_tokens_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_user='ll_runtime' AND NEW.role<>'agent' THEN RAISE EXCEPTION 'Runtime provisioning is limited to agent keys'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_runtime_token_boundary BEFORE INSERT ON ll_tokens FOR EACH ROW EXECUTE FUNCTION ll_runtime_agent_tokens_only();
