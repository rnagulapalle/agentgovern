import { database } from "@/lib/durable/database";
import {
  workspaceMember,
  WorkspaceGate,
} from "@/components/control-plane/workspace-gate";
import { PageTitle } from "@/components/control-plane/ui";
export default async function RequestsPage() {
  const actor = await workspaceMember();
  if (!actor) return <WorkspaceGate />;
  const db = database();
  const { rows } = await db.query(
    "SELECT name,email,company,company_size,role,workflow,created_at FROM ll_sales_requests WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100",
    [actor.orgId],
  );
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="FOUNDER INBOX"
        title="Sales requests"
        description="Requests submitted through the public contact form. No email or meeting is sent automatically."
      />
      <section className="cp-panel cp-durable-card" data-private>
        {rows.length ? (
          rows.map((r, i) => (
            <article className="workspace-agent" key={i}>
              <h2>{r.company}</h2>
              <p>
                {r.name} · {r.role} · {r.company_size}
              </p>
              <p>{r.email}</p>
              <p>{r.workflow}</p>
              <p>{new Date(r.created_at).toLocaleString()}</p>
            </article>
          ))
        ) : (
          <p>No requests yet.</p>
        )}
      </section>
    </div>
  );
}
