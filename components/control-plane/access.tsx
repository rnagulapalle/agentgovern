"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeNext } from "@/lib/workspace/navigation";
export function TeamSignIn({ next = "/control-plane" }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="sales-form ph-no-capture"
      data-private
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/workspace/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: data.get("email"),
              password: data.get("password"),
            }),
          });
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          router.replace(safeNext(next));
          router.refresh();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Sign-in unavailable. Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Email
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          data-private
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          maxLength={256}
          data-private
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} className="cp-button cp-button-dark">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p>
        Access is by invitation.{" "}
        <Link prefetch={false} href="/contact-sales">Contact sales</Link> to explore your
        workflow.
      </p>
    </form>
  );
}
