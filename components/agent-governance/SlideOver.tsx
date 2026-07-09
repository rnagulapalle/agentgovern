"use client";

import { X } from "lucide-react";

/** Right-side slide-over used by the create flows (dark product surface). */
export function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        style={{ animation: "overlay-in 0.2s ease both" }}
      />
      <div
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl shadow-black/50"
        style={{ animation: "drawer-in 0.25s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <h3 className="text-[15px] font-semibold tracking-tight text-white">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] text-white/50 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      />
    </label>
  );
}
