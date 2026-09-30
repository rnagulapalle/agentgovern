import type { Metadata } from "next";
import { ControlProvider } from "@/components/control-plane/provider";
import { ControlShell } from "@/components/control-plane/shell";
import "./control-plane.css";

export const metadata: Metadata = {
  title: "Interactive agent control plane",
  description:
    "Explore how LoopLabs builds agent workflows, controls actions and execution, checks outputs, and recovers affected state.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/control-plane" },
};
export default function ControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ControlProvider>
      <ControlShell>{children}</ControlShell>
    </ControlProvider>
  );
}
