"use client";

import posthog from "posthog-js";
import { runProgress } from "./enquiries/presentation";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

const FIRST_TOUCH_KEY = "looplabs.analytics.first_touch.v1";

export function track(event: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY)
    return;
  posthog.capture(event, properties);
}

function searchEngine(host: string) {
  if (/google\./.test(host)) return "google";
  if (/bing\./.test(host)) return "bing";
  if (/duckduckgo\./.test(host)) return "duckduckgo";
  if (/search\.yahoo\./.test(host)) return "yahoo";
  return null;
}

function socialNetwork(host: string) {
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return "x";
  if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
  if (/(^|\.)youtube\.com$/.test(host)) return "youtube";
  return null;
}

export function acquisitionContext() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  let referrerHost = "";
  try {
    referrerHost = document.referrer
      ? new URL(document.referrer).hostname.replace(/^www\./, "")
      : "";
  } catch {
    referrerHost = "";
  }

  const utmSource = params.get("utm_source") || undefined;
  const utmMedium = params.get("utm_medium") || undefined;
  const productHunt = referrerHost === "producthunt.com" || utmSource === "producthunt";
  const engine = searchEngine(referrerHost);
  const social = socialNetwork(referrerHost);
  const hasPaidClick = Boolean(params.get("gclid") || params.get("msclkid"));
  let acquisitionChannel = "direct";
  if (productHunt) acquisitionChannel = "product_hunt";
  else if (hasPaidClick || /cpc|ppc|paid/.test(utmMedium || ""))
    acquisitionChannel = "paid_search";
  else if (engine) acquisitionChannel = "organic_search";
  else if (social) acquisitionChannel = "social";
  else if (utmMedium === "email") acquisitionChannel = "email";
  else if (referrerHost && referrerHost !== window.location.hostname)
    acquisitionChannel = "referral";

  return {
    acquisition_channel: acquisitionChannel,
    referrer_host: referrerHost || undefined,
    search_engine: engine || undefined,
    social_network: social || undefined,
    landing_path: window.location.pathname,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: params.get("utm_campaign") || undefined,
    utm_content: params.get("utm_content") || undefined,
    utm_term: params.get("utm_term") || undefined,
  };
}

export function registerFirstTouch() {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY)
    return {};
  const current = acquisitionContext();
  let first = current;
  try {
    const saved = window.localStorage.getItem(FIRST_TOUCH_KEY);
    first = saved ? JSON.parse(saved) : current;
    if (!saved) window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
  } catch {
    first = current;
  }
  posthog.register({
    ...current,
    first_acquisition_channel: first.acquisition_channel,
    first_referrer_host: first.referrer_host,
    first_landing_path: first.landing_path,
    first_utm_source: first.utm_source,
    first_utm_campaign: first.utm_campaign,
  });
  return current;
}

export function pageGroup(pathname: string) {
  if (pathname === "/") return "landing";
  if (pathname.startsWith("/control-plane")) return "product_tour";
  if (pathname.startsWith("/blog") || pathname.startsWith("/news"))
    return "content";
  if (pathname === "/guides") return "guides";
  return "seo_scenario";
}


// Only the fixed private-twin proof is classified here. This is engagement,
// never execution authority, independent effect verification or a conversion.
export function workflowProofState(value: unknown, expectedId: string): "verified" | "not_verified" | null {
  if (!value || typeof value !== "object") return null;
  const r = value as { id?: unknown; state?: unknown; steps?: unknown };
  if (!expectedId || r.id !== expectedId || !["active", "paused", "completed"].includes(String(r.state)) || !Array.isArray(r.steps) || r.steps.length !== 2) return null;
  const steps = r.steps as { ordinal?: unknown; connector?: unknown; action_id?: unknown; state?: unknown; evidence?: unknown }[];
  const states = [null, "held", "ready", "executing", "succeeded", "uncertain", "conflict", "rejected", "cancelled"];
  if (steps.some((step, i) => !step || typeof step !== "object" || step.ordinal !== i + 1 || step.connector !== ["crm", "email"][i] || typeof step.action_id !== "string" || !step.action_id || !states.includes(step.state as string | null) || (step.evidence != null && (typeof step.evidence !== "object" || typeof (step.evidence as { outcome?: unknown }).outcome !== "string"))) || steps[0].action_id === steps[1].action_id) return null;
  return runProgress(r.state as string, steps as Parameters<typeof runProgress>[1]).receipt ? "verified" : "not_verified";
}

export function captureWorkflowProofView(value: unknown, expectedId: string, viewed: Set<string>) {
  const state = workflowProofState(value, expectedId);
  if (!state || viewed.has(expectedId)) return;
  // IDs remain only in component memory, never in analytics properties/storage.
  // Repeated Open is deduplicated per mount; reload starts a new view session.
  viewed.add(expectedId);
  try { track("workflow_proof_viewed", { proof_kind: "crm_to_message_private_twin", verification_state: state }); } catch { /* Analytics must never block a permitted read. */ }
}

// SDK before_send is the final property boundary: SDK URL/referrer properties
// and persisted acquisition context can contain private IDs even when the
// explicit capture properties are safe. Strip them for this event only.
export function filterWorkflowProofEvent<T extends { event: string; properties: Record<string, unknown> }>(event: T | null): T | null {
  if (!event || event.event !== "workflow_proof_viewed") return event;
  const p = event.properties;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const opaque = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9-]{8,128}$/.test(v);
  if (p.proof_kind !== "crm_to_message_private_twin" || !["verified", "not_verified"].includes(String(p.verification_state)) || !opaque(p.distinct_id)) return null;
  const properties: Record<string, unknown> = { proof_kind: p.proof_kind, verification_state: p.verification_state, distinct_id: p.distinct_id, $process_person_profile: false };
  for (const key of ["$device_id", "$session_id", "$window_id"]) if (opaque(p[key])) properties[key] = p[key];
  if (p.$is_test === true) properties.$is_test = true;
  const filtered = { event: event.event, properties } as T;
  const outer = event as Record<string, unknown>;
  if (opaque(outer.uuid)) Object.assign(filtered, { uuid: outer.uuid });
  if (outer.timestamp instanceof Date && Number.isFinite(outer.timestamp.getTime())) Object.assign(filtered, { timestamp: outer.timestamp });
  else if (typeof outer.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(outer.timestamp)) Object.assign(filtered, { timestamp: outer.timestamp });
  return filtered;
}
