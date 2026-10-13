#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const htmlEntities = value => value.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');

export function linkCheckOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('An explicit owned loopback HTTP server is required for rendered link checks.');
  return url.origin;
}
export function internalPath(href, currentPath, origin) {
  if (!href || /^(#|mailto:|tel:|javascript:)/.test(href)) return null;
  const url = new URL(htmlEntities(href), new URL(currentPath, origin));
  if (url.origin !== origin || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/ph/')) return null;
  return `${url.pathname}${url.search}`;
}
// Follow only same-origin redirects: a successful external destination is not
// evidence that an internal route works, and the crawler never visits it.
async function internalResponse(origin, path) {
  let url = new URL(path, origin);
  const visited = new Set();
  for (let hop = 0; hop < 10; hop++) {
    if (url.origin !== origin || visited.has(url.href)) throw Error('Internal redirect escaped the owned origin or formed a cycle.');
    visited.add(url.href);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw Error('Internal redirect omitted its destination.');
    url = new URL(location, url);
  }
  throw Error('Internal redirect exceeded ten hops.');
}
// The caller owns provisioning, production startup and confirmed teardown.
// Importing this module starts no server and creates no application authority.
export async function crawlRenderedLinks(value) {
  const origin = linkCheckOrigin(value);
  const queue = ['/', '/control-plane'], queued = new Set(queue), checked = new Map(), failures = [];
  while (queue.length) {
    const path = queue.shift();
    let response;
    try { response = await internalResponse(origin, path); }
    catch (error) { failures.push(`${path}: ${error.message}`); continue; }
    checked.set(path, response.status);
    if (!response.ok) { failures.push(`${path} returned ${response.status}`); continue; }
    if (!(response.headers.get('content-type') || '').includes('text/html')) continue;
    const html = await response.text();
    for (const match of html.matchAll(/\bhref=["']([^"']+)["']/gi)) {
      const next = internalPath(match[1], new URL(response.url).pathname, origin);
      if (!next || queued.has(next)) continue;
      queued.add(next); queue.push(next);
    }
    if (queued.size > 150) { failures.push('Internal crawl exceeded 150 unique destinations'); break; }
  }
  if (failures.length) throw Error(`Internal link check failed:\n- ${failures.join('\n- ')}`);
  return { checked: checked.size };
}
export async function runLinkCheck(env = process.env) {
  const port = Number(env.LINK_CHECK_PORT || 3099);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Valid explicit link-check port required.');
  if (!env.LOOPLABS_TENANT_WEB_CONFIG) throw Error('Installed web publication required before starting the rendered link check.');
  const origin = linkCheckOrigin(`http://127.0.0.1:${port}`);
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', () => reject(Error('Link-check port is already occupied; no existing server is adopted.'))); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...env, PORT: String(port) },
  });
  // Startup diagnostics stay private to the process; never emit loaded inputs.
  server.stdout.resume(); server.stderr.resume();
  let spawnError; server.once('error', error => { spawnError = error; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnError || server.exitCode !== null || server.signalCode !== null) throw Error('Owned production server exited before link checking.');
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await sleep(250);
    }
    if (!ready) throw Error('Owned production server did not become ready for link checking.');
    const result = await crawlRenderedLinks(origin);
    console.log(`✓ ${result.checked} rendered internal destinations returned success`);
    return result;
  } finally {
    if (!spawnError && server.exitCode === null && server.signalCode === null) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { if (!server.kill('SIGKILL')) reject(Error('Owned server termination refused.')); }, 2000);
        server.once('exit', () => { clearTimeout(timer); resolve(); });
        if (!server.kill('SIGTERM')) { clearTimeout(timer); reject(Error('Owned server termination refused.')); }
      });
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runLinkCheck();
