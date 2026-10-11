// Disposable proof transport only. Never bind a host's public interface.
import { createServer, request } from "node:http";
import type { Socket } from "node:net";

export function containerHostAddress(platform: string, gateway: string, localAddresses: string[]): string {
  if (platform !== "linux") return "127.0.0.1";
  const octets = gateway.split(".").map(Number);
  const privateAddress = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && (octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168);
  if (!privateAddress || !localAddresses.includes(gateway)) throw Error("Owned local Docker bridge address required for container proof transport.");
  return gateway;
}

export async function fixtureRelay(address: string, port: number, upstreamPort = port) {
  const sockets = new Set<Socket>();
  const counts = {methods:{GET:0,PATCH:0,POST:0}, statuses:{} as Record<string,number>, transportErrors:0};
  const server = createServer((client,response) => {
    if (client.method === "GET" || client.method === "PATCH" || client.method === "POST") counts.methods[client.method]++;
    const upstream = request({hostname:"127.0.0.1",port:upstreamPort,path:client.url,method:client.method,headers:client.headers}, result => {
      const status=result.statusCode || 502;
      counts.statuses[String(status)]=(counts.statuses[String(status)] || 0)+1;
      response.writeHead(status,result.headers);result.pipe(response);
      result.on("error",()=>response.destroy());
    });
    upstream.on("socket",socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));});
    upstream.on("error",()=>{
      counts.transportErrors++;
      if (!response.headersSent) {response.writeHead(502);response.end();} else response.destroy();
    });
    client.on("aborted",()=>upstream.destroy());client.pipe(upstream);
  });
  server.on("connection",socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));});
  await new Promise<void>((resolve,reject) => {server.once("error", reject); server.listen(port,address,resolve);});
  const stop=async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  };
  return Object.assign(stop,{snapshot:()=>structuredClone(counts)});
}
