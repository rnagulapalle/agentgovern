import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c1917",
          borderRadius: 38,
        }}
      >
        <svg width="132" height="132" viewBox="0 0 32 32" fill="none">
          <path d="m16 3 11 6.5v13L16 29 5 22.5v-13L16 3Z" stroke="#d6d0c3" strokeWidth="1.5" />
          <path d="m5 9.5 11 6.4 11-6.4M16 15.9v13" stroke="#d6d0c3" strokeWidth="1.3" />
          <path d="M10.5 6.2 21.5 12.7v6.5L16 22.5l-5.5-3.3v-6.5l11-6.5" stroke="#d6d0c3" strokeWidth="1.3" />
          <circle cx="16" cy="15.9" r="2.15" fill="#f5f5f4" />
        </svg>
      </div>
    ),
    size,
  );
}
