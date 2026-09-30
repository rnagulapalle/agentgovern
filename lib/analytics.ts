"use client";

import posthog from "posthog-js";

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

