import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const isLoopLabs =
  window.location.hostname === "looplabs.run" ||
  window.location.hostname === "www.looplabs.run";
const isDebugSession =
  new URLSearchParams(window.location.search).get("analytics_debug") === "1";

if (token && (isLoopLabs || isDebugSession)) {
  posthog.init(token, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ph",
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-private]",
    },
  });

  if (isDebugSession) {
    posthog.register_for_session({ $is_test: true });
  }
}

