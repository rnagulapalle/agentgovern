#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Pre-deploy safety gate.                                              ║
# ║  Aborts the deploy if a shipped invariant was reverted, the prod     ║
# ║  build breaks, or tests fail. Runs locally BEFORE anything is rsynced ║
# ║  to the server. Standalone: ./scripts/preflight.sh                    ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

fail=0
ok()  { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad() { printf "  \033[31m✗\033[0m %s\n" "$1"; fail=1; }

# need <description> <substring> <file>
need() {
  if grep -qF -- "$2" "$3" 2>/dev/null; then ok "$1"; else bad "$1 — expected \"$2\" in $3"; fi
}

echo "▸ Invariants (shipped work must not be silently reverted)"
need "homepage control-layer positioning" "Control actions," app/page.tsx
need "Book-a-demo CTA (Cal)"       "cal.com/rajnagulapalle" app/page.tsx
need "Geist font"                  "GeistSans"              app/layout.tsx
need "workflow positioning"        "Build workflows. Control actions. Recover execution." lib/site.ts
need "product-tour language"       "Explore the product tour" app/page.tsx
need "content feed"                "application/rss+xml" app/layout.tsx
need "light theme · SEO shell"     "theme-light"           components/seo/SeoPageShell.tsx
need "light theme · blog index"    "theme-light"           app/blog/page.tsx
need "legacy news redirect"        "permanentRedirect"      app/news/page.tsx
need "light theme · news article"  "theme-light"           components/news/NewsArticle.tsx
need "guides via light SEO shell"  "SeoPageShell"          app/guides/page.tsx

echo "▸ Production build"
if pnpm build >/tmp/ag-preflight-build.log 2>&1; then ok "pnpm build"; else bad "pnpm build failed — see /tmp/ag-preflight-build.log"; fi

echo "▸ Tests"
if pnpm test >/tmp/ag-preflight-test.log 2>&1; then ok "pnpm test"; else bad "pnpm test failed — see /tmp/ag-preflight-test.log"; fi

if [ "$fail" -ne 0 ]; then
  printf "\n\033[31m✗ PREFLIGHT FAILED — deploy aborted.\033[0m\n"
  printf "  A shipped invariant was likely reverted (see ✗ above), or the build/tests broke.\n"
  printf "  Restore with:  git checkout HEAD -- <file>   then re-run.\n"
  exit 1
fi
printf "\n\033[32m✓ Preflight passed — safe to deploy.\033[0m\n"
