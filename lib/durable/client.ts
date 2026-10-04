import type { DurableAction, Proposal } from "./contracts";

// Framework-neutral client. Use only in trusted agent/server runtimes; never
// embed agent access tokens in a public browser bundle.
export class LoopLabsClient {
  private endpoint: string;
  constructor(
    origin: string,
    private token: string,
  ) {
    const url = new URL(origin);
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Use an HTTPS origin, or a loopback HTTP development origin.",
      );
    this.endpoint = `${url.origin}/api/durable`;
  }
  private async request(
    url: string,
    init: RequestInit,
  ): Promise<DurableAction> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error || "Control plane request failed.");
    return value;
  }
  propose(proposal: Proposal) {
    // Callers retain the action ID across network retries; never regenerate it.
    return this.request(this.endpoint, {
      method: "POST",
      body: JSON.stringify({ operation: "propose", ...proposal }),
    });
  }
  read(actionId: string) {
    return this.request(
      `${this.endpoint}?action=${encodeURIComponent(actionId)}`,
      { method: "GET" },
    );
  }
}
