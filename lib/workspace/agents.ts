import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { authorize, tokenHash } from "../durable/service";
export interface AgentInput {
  id: string;
  name: string;
  owner: string;
  role: "discount_agent";
  connector: "discount_record";
  actionLimit: number;
}
export function parseAgent(v: Record<string, unknown>): AgentInput {
  if (
    Object.keys(v).some(
      (k) =>
        !["id", "name", "owner", "role", "connector", "actionLimit"].includes(
          k,
        ),
    ) ||
    typeof v.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(v.id) ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    v.name.length > 120 ||
    typeof v.owner !== "string" ||
    v.owner.length > 254 ||
    v.role !== "discount_agent" ||
    v.connector !== "discount_record" ||
    !Number.isInteger(v.actionLimit) ||
    (v.actionLimit as number) < 1 ||
    (v.actionLimit as number) > 1000
  )
    throw new ControlError(
      400,
      "Choose a discount agent, supported connector, owner and action limit (1–1,000).",
    );
  return {
    ...v,
    name: v.name.trim(),
    owner: v.owner.trim().toLowerCase(),
  } as AgentInput;
}
export async function agentDirectory(db: Pool, actor: Actor) {
  return transaction(db, actor.orgId, async (c) => {
    await authorize(c, actor, ["operator"]);
    const agents = (
      await c.query(
        "SELECT a.id,a.active,a.tools,a.action_limit,a.reserved,p.name,p.owner,p.role,p.connector FROM ll_agents a LEFT JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id WHERE a.org_id=$1 ORDER BY a.id",
        [actor.orgId],
      )
    ).rows;
    const owners = (
      await c.query(
        "SELECT email,name FROM ll_members WHERE org_id=$1 AND active=true ORDER BY name",
        [actor.orgId],
      )
    ).rows;
    return { agents, owners };
  });
}
export async function registerAgent(
  db: Pool,
  actor: Actor,
  input: Record<string, unknown>,
) {
  const p = parseAgent(input);
  return transaction(db, actor.orgId, async (c) => {
    await authorize(c, actor, ["operator"]);
    if (
      !(
        await c.query(
          "SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true",
          [actor.orgId, p.owner],
        )
      ).rows[0]
    )
      throw new ControlError(
        400,
        "Choose an active workspace member as owner.",
      );
    if (
      !(
        await c.query("SELECT 1 FROM ll_records WHERE org_id=$1", [actor.orgId])
      ).rows[0]
    )
      throw new ControlError(409, "The discount connector is unavailable.");
    if (
      (
        await c.query("SELECT 1 FROM ll_agents WHERE org_id=$1 AND id=$2", [
          actor.orgId,
          p.id,
        ])
      ).rows[0]
    )
      throw new ControlError(
        409,
        "That agent ID already exists. Review its existing boundaries.",
      );
    await c.query(
      "INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES($1,$2,ARRAY['proof.discount'],$3)",
      [actor.orgId, p.id, p.actionLimit],
    );
    await c.query(
      "INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES($1,$2,$3,$4,$5,$6)",
      [actor.orgId, p.id, p.name, p.owner, p.role, p.connector],
    );
    const token = randomBytes(32).toString("base64url");
    await c.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,'agent')",
      [tokenHash(token), actor.orgId, p.id],
    );
    await c.query(
      "INSERT INTO ll_events(org_id,kind,subject) VALUES($1,'agent_registered',$2)",
      [actor.orgId, actor.subject],
    );
    return { id: p.id, agentToken: token };
  });
}
