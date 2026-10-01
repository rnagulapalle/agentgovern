#!/usr/bin/env node

import { spawn } from "node:child_process";

const port = Number(process.env.LINK_CHECK_PORT || 3099);
const origin = `http://127.0.0.1:${port}`;
const server = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port) },
});
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const htmlEntities = (value) =>
  value.replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.exitCode != null) {
      throw new Error(`Next.js exited before link checking.\n${serverOutput}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${origin}.\n${serverOutput}`);
}

function internalPath(href, currentPath) {
  if (
    !href ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("javascript:")
  )
    return null;
  const url = new URL(htmlEntities(href), new URL(currentPath, origin));
  if (url.origin !== origin) return null;
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/ph/"))
    return null;
  return `${url.pathname}${url.search}`;
}

async function crawl() {
  await waitForServer();
  const queue = ["/", "/control-plane"];
  const queued = new Set(queue);
  const checked = new Map();
  const failures = [];

  while (queue.length) {
    const path = queue.shift();
    const response = await fetch(new URL(path, origin), { redirect: "follow" });
    checked.set(path, response.status);
    if (!response.ok) {
      failures.push(`${path} returned ${response.status}`);
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) continue;
    const html = await response.text();
    const hrefs = html.matchAll(/\bhref=["']([^"']+)["']/gi);
    for (const match of hrefs) {
      const next = internalPath(match[1], path);
      if (!next || queued.has(next)) continue;
      queued.add(next);
      queue.push(next);
    }
    if (queued.size > 150) {
      failures.push("Internal crawl exceeded 150 unique destinations");
      break;
    }
  }

  if (failures.length) {
    throw new Error(`Internal link check failed:\n- ${failures.join("\n- ")}`);
  }
  console.log(`✓ ${checked.size} rendered internal destinations returned success`);
}

try {
  await crawl();
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(2_000).then(() => server.kill("SIGKILL")),
  ]);
}
