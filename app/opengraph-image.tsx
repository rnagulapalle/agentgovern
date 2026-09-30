import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "54px 64px",
          background: "#f3f2ef",
          color: "#1c1917",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 32 32" fill="none">
            <path d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z" stroke="#918775" strokeWidth="1.7" />
            <path d="m5 9.5 11 6.4 11-6.4M16 15.9v13" stroke="#918775" strokeWidth="1.4" />
            <path d="M10.5 6.2 21.5 12.7v6.5L16 22.5l-5.5-3.3v-6.5l11-6.5" stroke="#918775" strokeWidth="1.4" />
            <circle cx="16" cy="15.9" r="2.15" fill="#1c1917" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 700 }}>{SITE.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: -4, lineHeight: 1.05 }}>
            Control every agent action.
          </div>
          <div style={{ fontSize: 28, color: "#57534e" }}>
            Enforce permissions, supervise execution, inspect outputs, and recover state.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #d6d3d1", paddingTop: 26, fontSize: 20 }}>
          <span>Actions / Execution / Outputs / Recovery</span>
          <span>{new URL(SITE.url).hostname}</span>
        </div>
      </div>
    ),
    size,
  );
}
