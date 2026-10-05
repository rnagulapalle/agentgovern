// Isolated proof harness: serves the actual Next route handlers over loopback HTTP.
// It is not a production worker or a replacement deployment server.
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import * as workflows from "../app/api/durable/workflows/route";
import * as connectors from "../app/api/durable/connectors/route";
const server = createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Listener unavailable");
    const url = `http://127.0.0.1:${address.port}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (typeof v === "string") headers.set(k, v);
    const request = new NextRequest(url, {
      method: req.method,
      headers,
      ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
    });
    const handler = req.url?.startsWith("/api/durable/workflows")
      ? workflows
      : req.url?.startsWith("/api/durable/connectors")
        ? connectors
        : null;
    if (!handler) {
      res.writeHead(404);
      res.end();
      return;
    }
    const result = await (req.method === "POST"
      ? handler.POST(request)
      : handler.GET(request));
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  } catch {
    res.writeHead(503);
    res.end("Proof harness request failed");
  }
});
server.listen(0, "127.0.0.1", () => {
  const a = server.address();
  if (a && typeof a !== "string") console.log(JSON.stringify({ port: a.port }));
});
