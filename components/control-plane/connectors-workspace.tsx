"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageTitle } from "./ui";
export function ConnectorsWorkspace() {
  const [state, setState] = useState<{
    discount: boolean;
    refund: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/api/durable", { cache: "no-store" }),
      fetch("/api/durable/refunds", { cache: "no-store" }),
    ])
      .then(async (rs) => {
        const data = await Promise.all(rs.map((r) => r.json()));
        if (rs.some((r) => !r.ok))
          throw new Error(data.find((v) => v.error)?.error);
        setState({
          discount: Boolean(data[0].record),
          refund: data[1].provider.available,
        });
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="ALLOWED SYSTEMS"
        title="Connectors"
        description="A connector defines where an agent may act. Only the approved sample connectors below are configured in this workspace."
      />
      {error && (
        <p className="cp-durable-message is-error" role="alert">
          {error}
        </p>
      )}
      <div className="cp-durable-grid">
        <section className="cp-panel cp-durable-card">
          <h2>Sample discount record</h2>
          <p>
            <strong>
              {state
                ? state.discount
                  ? "Available"
                  : "Unavailable"
                : "Checking connection…"}
            </strong>
          </p>
          <p>
            Allowed action: update one versioned discount record. Approval and
            recovery verify the saved record before another change.
          </p>
          <Link className="cp-button" href="/control-plane/agents">
            Assign to a discount agent →
          </Link>
        </section>
        <section className="cp-panel cp-durable-card">
          <h2>Simulated payment provider</h2>
          <p>
            <strong>
              {state
                ? state.refund
                  ? "Available"
                  : "Unavailable"
                : "Checking connection…"}
            </strong>
          </p>
          <p>
            Allowed action: refund the prepared USD payment. The existing refund
            agent has this boundary. No real money moves.
          </p>
          <Link
            className="cp-button"
            href="/control-plane/actions?workflow=refunds"
          >
            Review refund boundaries →
          </Link>
        </section>
        <section className="cp-panel cp-durable-card">
          <h2>Your customer systems</h2>
          <p>
            <strong>Not connected</strong>
          </p>
          <p>
            CRM, live payments, email and model providers need a scoped adapter
            and integration review. Do not paste production credentials into
            this workspace.
          </p>
          <Link className="cp-button" href="/contact-sales">
            Discuss an integration →
          </Link>
        </section>
      </div>
    </div>
  );
}
