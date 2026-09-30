import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LoopLabs agent control plane",
    short_name: "LoopLabs",
    description:
      "Control AI agent actions, execution, outputs, approvals, and recovery.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#1c1917",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
