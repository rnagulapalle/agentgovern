"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DurableWorkspace } from "./durable-workspace";
import { RefundWorkspace } from "./refund-workspace";
import { ConnectorActionsWorkspace } from "./connector-actions-workspace";
const workflowFrom = (v: string | null) =>
  ["refunds", "crm", "email"].includes(v || "") ? v! : "discounts";
export function ActionsWorkspace({ scriptDemo = false }: { scriptDemo?: boolean }) {
  const q = useSearchParams();
  const [workflow, setWorkflow] = useState(workflowFrom(q.get("workflow")));
  useEffect(() => {
    setWorkflow(workflowFrom(q.get("workflow")));
  }, [q]);
  const selectedWorkflow = scriptDemo && workflow === "refunds" ? "discounts" : workflow;
  return (
    <>
      <div className="workspace-workflow-select">
        <label>
          Workflow
          <select
            value={selectedWorkflow}
            onChange={(e) => setWorkflow(e.target.value)}
          >
            <option value="discounts">Discount changes</option>
            {!scriptDemo && <option value="refunds">Refunds</option>}
            <option value="crm">CRM contact updates</option>
            <option value="email">Customer messages</option>
          </select>
        </label>
        <p>
          One workspace. Each workflow keeps its own permissions, approval rules
          and saved history.
        </p>
      </div>
      {selectedWorkflow === "crm" || selectedWorkflow === "email" ? (
        <ConnectorActionsWorkspace connector={selectedWorkflow} />
      ) : selectedWorkflow === "refunds" ? (
        <RefundWorkspace />
      ) : (
        <DurableWorkspace scriptDemo={scriptDemo} />
      )}
    </>
  );
}
