"use client";
import { useState } from "react";
import { COMPANY_SIZES } from "@/lib/workspace/sales-options";
import { track } from "@/lib/analytics";
export function SalesForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className="sales-success" role="status">
        <h2>We have your request.</h2>
        <p>
          Choose a time to walk through one workflow with us. Your request is
          saved for the founders to review.
        </p>
        <a
          className="cp-button cp-button-dark"
          href="https://cal.com/rajnagulapalle"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            track("demo_booking_clicked", { source: "sales_request" })
          }
        >
          Choose a time ↗
        </a>
      </div>
    );
  return (
    <form
      className="sales-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = Object.fromEntries(
          new FormData(e.currentTarget).entries(),
        );
        try {
          const r = await fetch("/api/sales", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setDone(true);
          track("sales_request_submitted", { source: "contact_sales" });
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Could not save your request. Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Work email
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="email"
          data-private
        />
      </label>
      <label>
        Your name
        <input
          name="name"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          data-private
        />
      </label>
      <label>
        Company
        <input
          name="company"
          required
          minLength={2}
          maxLength={160}
          autoComplete="organization"
          data-private
        />
      </label>
      <label>
        Company size
        <select name="companySize" required defaultValue="">
          <option value="" disabled>
            Select company size
          </option>
          {COMPANY_SIZES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Your role
        <input
          name="role"
          required
          maxLength={120}
          placeholder="VP Operations, CIO, founder…"
          data-private
        />
      </label>
      <label>
        Which workflow would you like to discuss?
        <textarea
          name="workflow"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          placeholder="What does it change or send? Who approves exceptions?"
          data-private
        />
      </label>
      <label className="sales-honeypot" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {error && <p role="alert">{error}</p>}
      <p>
        We use these details to respond to your request. Please leave out
        customer records, passwords and payment details.
      </p>
      <button className="cp-button cp-button-dark" disabled={busy}>
        {busy ? "Saving request…" : "Request a walkthrough"}
      </button>
    </form>
  );
}
