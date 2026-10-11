// Disposable TLS transport for actual Next handlers, not a production gateway.
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import * as connectors from "../app/api/durable/connectors/route";
import * as workflows from "../app/api/durable/workflows/route";
const server = createServer({ key: readFileSync("/run/tls/server.key"), cert: readFileSync("/run/tls/server.pem"), minVersion: "TLSv1.2" }, async (req, res) => {
  try {
    if (req.headers.host !== "looplabs-staging.example.test:3443" || !["GET", "POST"].includes(req.method || "")) { res.writeHead(400); res.end(); return; }
    if (req.url === "/health") { res.end("ready"); return; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new NextRequest(`https://looplabs-staging.example.test:3443${req.url}`, { method: req.method, headers, ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
    const path = request.nextUrl.pathname;
    const handler = path === "/api/durable/connectors" ? connectors : path === "/api/durable/workflows" ? workflows : null;
    if (!handler) { res.writeHead(404); res.end(); return; }
    const result = await (req.method === "POST" ? handler.POST(request) : handler.GET(request));
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch { res.writeHead(503); res.end("Trial request unconfirmed"); }
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
server.on("connect", (_req, socket) => socket.destroy()); server.on("upgrade", (_req, socket) => socket.destroy());
server.listen(3443, "0.0.0.0", () => console.log("trial-ready"));
