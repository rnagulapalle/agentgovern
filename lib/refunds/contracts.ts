import { ControlError } from "../durable/contracts";
export const PAYMENT = "ch_looplabs_refund_demo";
export const STATES = [
  "held",
  "ready",
  "executing",
  "succeeded",
  "blocked",
  "rejected",
  "cancelled",
  "uncertain",
  "conflict",
] as const;
export interface RefundProposal {
  actionId: string;
  agentId: string;
  paymentId: string;
  amount: number;
  currency: "usd";
}
export interface RefundAction {
  id: string;
  agent_id: string;
  payment_id: string;
  amount: number;
  currency: "usd";
  policy_version: number;
  payload_hash: string;
  state: (typeof STATES)[number];
  reason: string;
  approved_by: string | null;
  approval_until: string | null;
  lease_token: string | null;
  lease_until: string | null;
  provider_id: string | null;
  provider_status: string | null;
  created_at: string;
}
export interface ProviderRefund {
  id: string;
  amount: number;
  currency: string;
  charge: string;
  status: string;
  metadata: { looplabs_action: string };
}
export interface PaymentEvidence {
  id: string;
  amount: number;
  currency: string;
  paid: boolean;
  amount_refunded: number;
}
export interface RefundProvider {
  readonly workspaceId: string;
  payment(): Promise<PaymentEvidence>;
  refunds(): Promise<ProviderRefund[]>;
  create(action: RefundAction, lostResponse: boolean): Promise<ProviderRefund>;
}
export interface RefundSnapshot {
  policy: {
    version: number;
    auto_limit: number;
    hard_limit: number;
    budget: number;
    reserved: number;
  };
  agent: { id: string; active: boolean; tools: string[] } | null;
  actions: RefundAction[];
  events: {
    id: string;
    action_id: string;
    kind: string;
    subject: string;
    at: string;
  }[];
  provider: {
    available: boolean;
    payment: PaymentEvidence | null;
    refunds: ProviderRefund[];
  };
}
export function parseRefund(value: unknown): RefundProposal {
  const p = value as RefundProposal;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    Object.keys(p).some(
      (k) =>
        !["actionId", "agentId", "paymentId", "amount", "currency"].includes(k),
    ) ||
    typeof p.actionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      p.actionId,
    ) ||
    p.agentId !== "refund-agent" ||
    p.paymentId !== PAYMENT ||
    p.currency !== "usd" ||
    !Number.isSafeInteger(p.amount) ||
    p.amount <= 0 ||
    p.amount > 100000
  )
    throw new ControlError(
      400,
      "Use the registered refund agent, prepared USD payment, UUID v4, and positive amount in cents (maximum 100000).",
    );
  return p;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
