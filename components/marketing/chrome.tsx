"use client";

import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { LoopMark } from "@/components/brand/loop-mark";
import { SITE } from "@/lib/site";

const CAL_URL = "https://cal.com/rajnagulapalle";
const NAV = [
  { href: "/#controls", label: "Controls" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#recovery", label: "Recovery" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Blog" },
];

export function MarketingHeader({ section }: { section?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="marketing-header">
      <Link href="/" className="marketing-wordmark" aria-label="LoopLabs home">
        <LoopMark />
        <span>LoopLabs</span>
      </Link>
      {section && <span className="marketing-section">{section}</span>}
      <nav className="marketing-desktop-nav" aria-label="Main navigation">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}>{item.label}</Link>
        ))}
        <Link href="/control-plane">Product tour <ArrowUpRight size={14} /></Link>
      </nav>
      <a className="marketing-nav-cta" href={CAL_URL} target="_blank" rel="noopener noreferrer">
        Book a demo
      </a>
      <button
        className="marketing-menu-toggle"
        aria-expanded={open}
        aria-controls="marketing-navigation"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <Menu />}
      </button>
      {open && (
        <nav id="marketing-navigation" className="marketing-mobile-nav" aria-label="Mobile navigation">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}<ArrowUpRight size={16} />
            </Link>
          ))}
          <Link href="/control-plane" onClick={() => setOpen(false)}>
            Product tour <ArrowUpRight size={16} />
          </Link>
        </nav>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div>
          <Link href="/" className="marketing-wordmark"><LoopMark /><span>LoopLabs</span></Link>
          <p>Build agent workflows. Control actions and execution. Recover when a run changes the wrong state.</p>
        </div>
        <nav aria-label="Controls">
          <strong>CONTROLS</strong>
          <Link href="/control-plane/policies">Action controls</Link>
          <Link href="/control-plane/runs">Execution controls</Link>
          <Link href="/control-plane/outputs">Output controls</Link>
          <Link href="/control-plane/reconciliation">Recovery</Link>
        </nav>
        <nav aria-label="Resources">
          <strong>RESOURCES</strong>
          <Link href="/guides">Guides</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/feed.xml">RSS feed</Link>
        </nav>
        <nav aria-label="Contact">
          <strong>CONTACT</strong>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          <a href="https://x.com/rnagulapalle" target="_blank" rel="noopener noreferrer">Follow the build</a>
        </nav>
      </div>
      <div className="marketing-footer-bottom"><span>© 2026 LoopLabs</span><span>looplabs.run</span></div>
    </footer>
  );
}

export const marketingPrimaryButton = "marketing-primary-button";
export const marketingSecondaryButton = "marketing-secondary-button";
export const marketingTextLink = "marketing-text-link";
