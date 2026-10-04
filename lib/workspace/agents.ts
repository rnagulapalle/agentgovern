import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { authorize, tokenHash } from "../durable/service";
export interface AgentInput {
  id: string;
  name: string;
  owner: string;
  role: "discount_agent" | "crm_agent" | "email_agent";
  connector: "discount_record" | "crm_twin" | "email_twin";
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
    ![
      ["discount_agent", "discount_record"],
      ["crm_agent", "crm_twin"],
      ["email_agent", "email_twin"],
    ].some(
      ([role, connector]) => v.role === role && v.connector === connector,
    ) ||
    !Number.isInteger(v.actionLimit) ||
    (v.actionLimit as number) < 1 ||
    (v.actionLimit as number) > 1000
  )
    throw new ControlError(
      400,
      "Choose a supported agent role and sample connector, owner and action limit (1–1,000).",
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
    const connected =
      p.connector === "discount_record"
        ? await c.query("SELECT 1 FROM ll_records WHERE org_id=$1", [
            actor.orgId,
          ])
        : await c.query(
            "SELECT 1 FROM ll_connector_policies WHERE org_id=$1 AND connector=$2 AND active=true",
            [actor.orgId, p.connector === "crm_twin" ? "crm" : "email"],
          );
    if (!connected.rows[0])
      throw new ControlError(
        409,
        "The selected sample connector is unavailable.",
      );
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
      "INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES($1,$2,$3,$4)",
      [
        actor.orgId,
        p.id,
        [
          p.connector === "discount_record"
            ? "proof.discount"
            : p.connector === "crm_twin"
              ? "twin.crm"
              : "twin.email",
        ],
        p.actionLimit,
      ],
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
