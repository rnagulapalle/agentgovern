"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DurableWorkspace } from "./durable-workspace";
import { RefundWorkspace } from "./refund-workspace";
import { ConnectorActionsWorkspace } from "./connector-actions-workspace";
const workflowFrom = (v: string | null) =>
  ["refunds", "crm", "email"].includes(v || "") ? v! : "discounts";
export function ActionsWorkspace() {
  const q = useSearchParams();
  const [workflow, setWorkflow] = useState(workflowFrom(q.get("workflow")));
  useEffect(() => {
    setWorkflow(workflowFrom(q.get("workflow")));
  }, [q]);
  return (
    <>
      <div className="workspace-workflow-select">
        <label>
          Workflow
          <select
            value={workflow}
            onChange={(e) => setWorkflow(e.target.value)}
          >
            <option value="discounts">Discount changes</option>
            <option value="refunds">Refunds</option>
            <option value="crm">CRM contact updates</option>
            <option value="email">Customer messages</option>
          </select>
        </label>
        <p>
          One workspace. Each workflow keeps its own permissions, approval rules
          and saved history.
        </p>
      </div>
      {workflow === "crm" || workflow === "email" ? (
        <ConnectorActionsWorkspace connector={workflow} />
      ) : workflow === "refunds" ? (
        <RefundWorkspace />
      ) : (
        <DurableWorkspace />
      )}
    </>
  );
}
