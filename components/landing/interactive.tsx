"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, Play, ChevronDown, Loader2 } from "lucide-react";
import { FAQ } from "@/lib/site";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Waitlist form                                                      */
/* ------------------------------------------------------------------ */

export function WaitlistForm({ id }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || state === "loading") return;
    setState("loading");
    try {
      // Wire a real provider by setting NEXT_PUBLIC_WAITLIST_ENDPOINT
      // (Formspree / ConvertKit / your API). Falls back to local success.
      const endpoint = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT;
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) throw new Error("bad response");
      } else {
        await new Promise((r) => setTimeout(r, 600));
        if (typeof window !== "undefined") {
          localStorage.setItem("agentgovern_waitlist", email);
        }
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div
        id={id}
        className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5 text-[14px] text-emerald-200"
      >
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.4} />
        You&apos;re on the list. We&apos;ll be in touch as we onboard teams.
      </div>
    );
  }

  return (
    <form id={id} onSubmit={submit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        placeholder="you@company.com"
        aria-label="Work email"
        className="h-11 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3.5 text-[14px] text-white placeholder:text-white/30 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
      />
      <button
        type="submit"
        disabled={!valid || state === "loading"}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 text-[14px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Join waitlist <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Demo video player (window-chrome framed)                           */
/* ------------------------------------------------------------------ */

export function DemoPlayer() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function play() {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.play();
    setPlaying(true);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0b0d] shadow-2xl shadow-black/50">
      {/* chrome bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="dots">
          <span className="bg-[#ff5f57]" />
          <span className="bg-[#febc2e]" />
          <span className="bg-[#28c840]" />
        </div>
        <span className="ml-2 font-mono text-[11px] text-white/40">
          agentgovern.ai/demo · 90s
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Interactive demo
        </span>
      </div>

      <div className="relative">
        <video
          ref={ref}
          className="block w-full"
          poster="/media/agentgovern-demo-poster.jpg"
          preload="metadata"
          controls={playing}
          playsInline
          onEnded={() => setPlaying(false)}
        >
          <source src="/media/agentgovern-demo.mp4" type="video/mp4" />
        </video>

        {!playing && (
          <button
            onClick={play}
            aria-label="Play demo"
            className="group absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/10"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md transition-transform group-hover:scale-105">
              <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ accordion                                                      */
/* ------------------------------------------------------------------ */

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.07]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-medium text-white/90">{q}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/40 transition-transform",
            open && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="-mt-1 pb-5 pr-8 text-[14px] leading-relaxed text-white/55">{a}</div>
      )}
    </div>
  );
}

export function Faq() {
  return (
    <div className="mx-auto max-w-3xl">
      {FAQ.map((item) => (
        <FaqRow key={item.q} q={item.q} a={item.a} />
      ))}
    </div>
  );
}
