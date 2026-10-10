import { expect, it } from "vitest";
import { createServer } from "node:http";
import { containerHostAddress, fixtureRelay } from "./container-host-transport";

it("uses only an owned private Linux bridge; Desktop retains its loopback proxy", () => {
  expect(containerHostAddress("darwin","",[])).toBe("127.0.0.1");
  expect(containerHostAddress("linux","172.17.0.1",["172.17.0.1"])).toBe("172.17.0.1");
  for (const address of ["0.0.0.0","127.0.0.1","8.8.8.8","172.17.0.999","172.17.0.1"]) {
    expect(() => containerHostAddress("linux",address,[])).toThrow("Owned local Docker bridge");
  }
  expect(() => containerHostAddress("linux","8.8.8.8",["8.8.8.8"])).toThrow();
});
it("relays exact authenticated fixture requests and closes the owned listener", async () => {
  const requests: unknown[] = [];
  const server = createServer(async (req,res) => {
    let body="";for await (const chunk of req) body+=chunk;
    requests.push({url:req.url,authorization:req.headers.authorization,body});
    res.writeHead(req.method==="PATCH"?412:202);res.end(req.method==="PATCH"?"condition-refused":"saved-effect");
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const endpoint=server.address();if(!endpoint || typeof endpoint==="string")throw Error("TCP fixture required");
  const reservation=createServer();await new Promise<void>(resolve=>reservation.listen(0,"127.0.0.1",resolve));
  const reserved=reservation.address();if(!reserved || typeof reserved==="string")throw Error("TCP reservation required");
  await new Promise<void>(resolve=>reservation.close(()=>resolve()));
  const url=`http://127.0.0.1:${reserved.port}/effects/action-1`;
  let stop: Awaited<ReturnType<typeof fixtureRelay>>|undefined;
  let upstreamStopped=false;
  try {
    stop=await fixtureRelay("127.0.0.1",reserved.port,endpoint.port);
    const response=await fetch(url,{method:"POST",headers:{authorization:"Bearer private-test"},body:'{"actionId":"action-1"}'});
    expect(response.status).toBe(202);expect(await response.text()).toBe("saved-effect");
    expect(requests).toEqual([{url:"/effects/action-1",authorization:"Bearer private-test",body:'{"actionId":"action-1"}'}]);
    const refused=await fetch(url,{method:"PATCH",body:'{"actionId":"action-1"}'});
    expect(refused.status).toBe(412);expect(await refused.text()).toBe("condition-refused");
    expect(stop.snapshot()).toEqual({methods:{GET:0,PATCH:1,POST:1},statuses:{"202":1,"412":1},transportErrors:0});
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));upstreamStopped=true;
    const unavailable=await fetch(url,{signal:AbortSignal.timeout(1000)});
    expect(unavailable.status).toBe(502);await unavailable.text();
    expect(stop.snapshot().transportErrors).toBe(1);
    await stop();stop=undefined;
    await expect(fetch(url,{signal:AbortSignal.timeout(1000)})).rejects.toThrow();
  } finally {
    await stop?.();if(!upstreamStopped){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  }
});
