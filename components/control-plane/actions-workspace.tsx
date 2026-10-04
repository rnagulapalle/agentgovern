"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DurableWorkspace } from "./durable-workspace";
import { RefundWorkspace } from "./refund-workspace";
export function ActionsWorkspace() {
  const q = useSearchParams();
  const [workflow, setWorkflow] = useState(
    q.get("workflow") === "refunds" ? "refunds" : "discounts",
  );
  useEffect(() => {
    setWorkflow(q.get("workflow") === "refunds" ? "refunds" : "discounts");
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
          </select>
        </label>
        <p>
          One workspace. Each workflow keeps its own permissions, approval rules
          and saved history.
        </p>
      </div>
      {workflow === "refunds" ? <RefundWorkspace /> : <DurableWorkspace />}
    </>
  );
}
