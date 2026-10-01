#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const pass = (message) => console.log(`  ✓ ${message}`);
const fail = (message) => {
  failures.push(message);
  console.error(`  ✗ ${message}`);
};
const read = (file) => readFileSync(path.join(root, file), "utf8");

console.log("Repository contract");
const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".cursor/rules/guardrails.mdc",
  ".github/copilot-instructions.md",
  ".agents/skills/looplabs-engineering/SKILL.md",
  "docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md",
  "docs/ENGINEERING_GATES.md",
];
for (const file of requiredFiles) {
  try {
    if (statSync(path.join(root, file)).size === 0) fail(`${file} is empty`);
    else pass(file);
  } catch {
    fail(`${file} is missing`);
  }
}

console.log("Shipped invariants");
const invariants = [
  ["homepage positioning", "app/page.tsx", "Control actions,"],
  ["demo disclosure", "app/page.tsx", "uses sample browser data"],
  [
    "analytics sample disclosure",
    "components/landing/execution-integrity.tsx",
    "Illustrative sample data",
  ],
  [
    "analytics motion control",
    "components/landing/execution-integrity.tsx",
    "Pause execution story",
  ],
  [
    "analytics product story",
    "components/landing/execution-integrity.tsx",
    "/landing/execution-integrity.webm",
  ],
  ["workflow positioning", "lib/site.ts", "Control consequential agent actions. Reconcile uncertain outcomes."],
  ["shared font", "app/layout.tsx", "GeistSans"],
  ["content feed", "app/layout.tsx", "application/rss+xml"],
  ["SEO shell", "components/seo/SeoPageShell.tsx", "theme-light"],
  ["claim audit", "docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md", "Demonstrated in the prototype"],
  [
    "control-plane logo returns home",
    "components/control-plane/shell.tsx",
    'aria-label="Back to LoopLabs homepage"',
  ],
];
for (const [name, file, expected] of invariants) {
  try {
    if (read(file).includes(expected)) pass(name);
    else fail(`${name}: expected ${JSON.stringify(expected)} in ${file}`);
  } catch {
    fail(`${name}: cannot read ${file}`);
  }
}

console.log("Unsupported public claims");
const sourceFiles = execFileSync("git", ["ls-files", "app", "components", "lib"], {
  cwd: root,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((file) => /\.(?:ts|tsx|js|jsx|md|mdx)$/.test(file));
const forbiddenClaims = [
  /\bimmutable (?:audit )?(?:log|ledger|receipt)s?\b/i,
  /\bproduction[- ]ready\b/i,
  /\bSOC 2 (?:Type II )?certified\b/i,
  /\bHIPAA compliant\b/i,
  /\bcryptographically signed receipts?\b/i,
];
for (const file of sourceFiles) {
  read(file)
    .split("\n")
    .forEach((line, index) => {
      for (const pattern of forbiddenClaims) {
        if (pattern.test(line)) fail(`${file}:${index + 1} contains unsupported claim ${pattern}`);
      }
    });
}
if (!failures.some((item) => item.includes("unsupported claim"))) {
  pass("no unsupported production claims in shipped source");
}

console.log("Credential hygiene");
const trackedAndNew = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const forbiddenNames = /(^|\/)(\.env(?:\..+)?|id_rsa|id_ed25519|.*\.(?:pem|p12|pfx|key))$/i;
const textExtensions = /(?:^|\/)(?:[^/.]+|.*\.(?:cjs|css|html|js|jsx|json|md|mdc|mjs|sh|toml|ts|tsx|txt|yaml|yml))$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bphc_[A-Za-z0-9_-]{20,}\b/,
];
for (const file of trackedAndNew) {
  if (forbiddenNames.test(file) && file !== ".env.example") {
    fail(`${file} is a forbidden credential filename`);
    continue;
  }
  if (!textExtensions.test(file)) continue;
  let content;
  try {
    content = read(file);
  } catch {
    continue;
  }
  if (secretPatterns.some((pattern) => pattern.test(content))) {
    fail(`${file} contains a value shaped like a credential`);
  }
}
if (!failures.some((item) => item.includes("credential"))) {
  pass("no tracked credential files or secret-shaped values");
}

if (failures.length) {
  console.error(`\nRepository gate failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log("\nRepository gate passed.");
