"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { LoopMark } from "@/components/brand/loop-mark";
import { SITE } from "@/lib/site";

const CAL_URL = "https://cal.com/rajnagulapalle";
const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#recovery", label: "Recovery" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Blog" },
];
const SOLUTIONS = [
  {
    href: "/#automation",
    label: "Workflow automation",
    description: "Turn a repeatable process into an agent workflow.",
  },
  {
    href: "/#controls",
    label: "Agent controls",
    description: "Set permissions, approvals, output checks, and recovery.",
  },
];

export function MarketingHeader({ section }: { section?: string }) {
  const [open, setOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);

  return (
    <header className="marketing-header">
      <Link href="/" className="marketing-wordmark" aria-label="LoopLabs home">
        <LoopMark />
        <span>LoopLabs</span>
      </Link>
      {section && <span className="marketing-section">{section}</span>}
      <nav className="marketing-desktop-nav" aria-label="Main navigation">
        <div className="marketing-solutions-menu">
          <button
            className="marketing-solutions-trigger"
            type="button"
            aria-expanded={solutionsOpen}
            aria-controls="marketing-solutions"
            onClick={() => setSolutionsOpen((value) => !value)}
          >
            Solutions <ArrowDown size={13} />
          </button>
          {solutionsOpen && (
            <div id="marketing-solutions" className="marketing-solutions-popover">
              <span>Solutions</span>
              {SOLUTIONS.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setSolutionsOpen(false)}>
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          )}
        </div>
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
          <span className="marketing-mobile-group-title">Solutions</span>
          {SOLUTIONS.map((item) => (
            <Link className="marketing-mobile-solution" key={item.href} href={item.href} onClick={() => setOpen(false)}>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <ArrowUpRight size={16} />
            </Link>
          ))}
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
        <nav aria-label="Solutions">
          <strong>SOLUTIONS</strong>
          <Link href="/#automation">Workflow automation</Link>
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
