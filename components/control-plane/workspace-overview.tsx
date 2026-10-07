"use client";
import Link from "next/link";
import { workspaceJson } from "@/lib/workspace/response";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/durable/contracts";
import type { RefundSnapshot } from "@/lib/refunds/contracts";
import { PageTitle } from "./ui";
export function WorkspaceOverview() {
  const [data, setData] = useState<{
    discount: Snapshot;
    refund: RefundSnapshot;
    connectors: { actions: { state: string }[] };
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/durable", { cache: "no-store" }),
      fetch("/api/durable/refunds", { cache: "no-store" }),
      fetch("/api/durable/connectors", { cache: "no-store" }),
    ])
      .then(async (rs) => {
        const values = await Promise.all(rs.map((r) => workspaceJson(r)));
        if (rs.some((r) => !r.ok))
          throw new Error(values.find((v) => v.error)?.error);
        setData({
          discount: values[0],
          refund: values[1],
          connectors: values[2],
        });
      })
      .catch((e) => setError(e.message));
  }, []);
  const actions = data
    ? [
        ...data.discount.actions,
        ...data.refund.actions,
        ...data.connectors.actions,
      ]
    : [];
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="YOUR CONTROL PLANE"
        title="Define. Control. Verify."
        description="Set up an agent, give it a boundary, and follow its actions through approval, execution and recovery."
      />
      {error && (
        <p role="alert" className="cp-durable-message is-error">
          {error}
        </p>
      )}
      <section className="cp-panel cp-durable-card">
        <h2>Ask for work, then review the plan.</h2>
        <p>Handle a sample customer enquiry: check the contact, review an approved acknowledgement and follow independent approvals through verified outcomes. No live customer systems or AI model are connected.</p>
        <Link prefetch={false} className="cp-button cp-button-dark" href="/control-plane/work">Work with agents →</Link>
      </section>
      <div className="cp-durable-grid">
        <section className="cp-panel cp-durable-card">
          <h2>Registered agents</h2>
          <div className="cp-durable-number">
            {data ? data.discount.agents.length : "—"}
          </div>
          <p>Saved identities with limited tool access.</p>
        </section>
        <section className="cp-panel cp-durable-card">
          <h2>Waiting for approval</h2>
          <div className="cp-durable-number">
            {data ? actions.filter((a) => a.state === "held").length : "—"}
          </div>
          <p>Requests that need a person before execution.</p>
        </section>
        <section className="cp-panel cp-durable-card">
          <h2>Uncertain outcomes</h2>
          <div className="cp-durable-number">
            {data
              ? actions.filter(
                  (a) => a.state === "uncertain" || a.state === "conflict",
                ).length
              : "—"}
          </div>
          <p>Review the evidence before another attempt.</p>
        </section>
      </div>
      <section className="cp-panel cp-durable-card">
        <h2>Start with one agent and one action.</h2>
        <div className="workspace-start-steps">
          {[
            [
              "01",
              "Assign an identity",
              "Choose an agent ID, a named owner and its allowed role.",
              "/control-plane/agents",
              "Onboard an agent",
            ],
            [
              "02",
              "Choose its connector",
              "Check which systems are available and the action each supports.",
              "/control-plane/connectors",
              "Review connectors",
            ],
            [
              "03",
              "Set the boundary",
              "Choose a workflow, set its approval limit and submit a request.",
              "/control-plane/actions",
              "Manage actions",
            ],
            [
              "04",
              "Check the outcome",
              "Approve an exception, apply a change, or verify an interrupted response.",
              "/control-plane/actions?workflow=refunds",
              "Explore a refund",
            ],
          ].map(([n, title, body, href, label]) => (
            <article key={n}>
              <span className="cp-eyebrow">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <Link prefetch={false} className="cp-button" href={href}>
                {label} →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Connected scope</h2>
        <p>
          The discount workflow changes a sample record. The refund workflow
          uses a simulated payment provider. CRM updates and customer messages
          use private FetchSandbox twins. No real money moves, no email is
          delivered and no AI model is called. These workflows use saved server
          state.
        </p>
        <p>
          Model access, output checks and multi-step traces are prepared
          examples with browser-local data. They are labeled separately in the
          navigation.
        </p>
        <Link
          prefetch={false}
          className="cp-button"
          href="/control-plane/workflows"
        >
          Review workflow requirements →
        </Link>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Understand the evidence</h2>
        <p>
          See which failure scenarios were actually checked and which production
          requirements remain open.
        </p>
        <Link
          prefetch={false}
          className="cp-button"
          href="/control-plane/verification"
        >
          Review verified behavior →
        </Link>
      </section>
    </div>
  );
}
