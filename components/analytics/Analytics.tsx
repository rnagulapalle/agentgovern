"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  pageGroup,
  registerFirstTouch,
  track,
} from "@/lib/analytics";

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    const acquisition = registerFirstTouch();
    track("site_page_viewed", {
      path: pathname,
      page_group: pageGroup(pathname),
      ...acquisition,
    });
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const element = target?.closest<HTMLElement>("a,button,summary");
      if (!element || element.closest("[data-private]")) return;
      const label = element.innerText.trim().replace(/\s+/g, " ").slice(0, 120);
      const href = element instanceof HTMLAnchorElement ? element.href : "";
      const url = href ? new URL(href, window.location.href) : null;

      if (url?.hostname === "cal.com") {
        track("demo_booking_clicked", { label, path: window.location.pathname });
      } else if (url?.pathname.startsWith("/control-plane")) {
        track("product_tour_cta_clicked", {
          label,
          destination: url.pathname,
          path: window.location.pathname,
        });
      } else if (element.tagName === "SUMMARY") {
        track("faq_opened", { question: label, path: window.location.pathname });
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}

