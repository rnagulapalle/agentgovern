import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { crawlRenderedLinks, internalPath, linkCheckOrigin, runLinkCheck } from './check-links.mjs';
async function withServer(handler, work) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { return await work(origin); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('import is inert; missing installed publication and invalid targets refuse before startup', async () => {
  await expect(runLinkCheck({})).rejects.toThrow('Installed web publication');
  for (const origin of ['https://127.0.0.1:3099', 'http://example.test:3099', 'http://name:secret@127.0.0.1:3099', 'http://127.0.0.1:3099/path']) expect(() => linkCheckOrigin(origin)).toThrow();
});
test('actual owned HTTP crawl covers public and gated routes, relative paths and queries', async () => {
  const visited=[];
  await withServer((req,res) => { visited.push(req.url);res.setHeader('Content-Type','text/html');res.end(req.url==='/'?'<a href="/guide?a=1&amp;b=2">Guide</a><a href="https://outside.example/">Outside</a>':'OK'); }, async origin => {
    expect(await crawlRenderedLinks(origin)).toEqual({checked:3});
    expect(visited).toEqual(['/','/control-plane','/guide?a=1&b=2']);
    expect(internalPath('#step','/',origin)).toBeNull();expect(internalPath('/_next/file','/',origin)).toBeNull();
  });
});
test('actual owned missing route cannot pass merely because the landing page works', async () => {
  await withServer((req,res) => {res.setHeader('Content-Type','text/html');if(req.url==='/bad')res.statusCode=404;res.end(req.url==='/'?'<a href="/bad">Missing</a>':'OK');}, async origin => {await expect(crawlRenderedLinks(origin)).rejects.toThrow('/bad returned 404');});
});
test('same-origin redirects resolve relative links at the final path', async () => {
  const visited=[];
  await withServer((req,res) => {
    visited.push(req.url);
    if(req.url==='/control-plane'){res.writeHead(302,{Location:'/access/sign-in'});res.end();return;}
    res.setHeader('Content-Type','text/html');
    if(req.url==='/access/sign-in')res.end('<a href="./help">Access help</a>');
    else if(req.url==='/'||req.url==='/access/help')res.end('OK');
    else {res.statusCode=404;res.end('Wrong relative path');}
  }, async origin => {
    expect(await crawlRenderedLinks(origin)).toEqual({checked:3});
    expect(visited).toEqual(['/','/control-plane','/access/sign-in','/access/help']);
  });
});
test('cross-origin redirect is refused before an external server is contacted', async () => {
  let externalRequests=0;
  await withServer((_req,res)=>{externalRequests++;res.end('OK');}, async external => {
    await withServer((req,res)=>{if(req.url==='/control-plane')res.writeHead(302,{Location:external});res.end('OK');},async origin=>{await expect(crawlRenderedLinks(origin)).rejects.toThrow('escaped the owned origin');});
  });expect(externalRequests).toBe(0);
});
test('redirect cycle is refused without unbounded requests', async () => {
  let count=0;await withServer((req,res)=>{count++;res.writeHead(302,{Location:req.url});res.end();},async origin=>{await expect(crawlRenderedLinks(origin)).rejects.toThrow('formed a cycle');});expect(count).toBe(2);
});

test('existing listener is refused before starting or adopting any application',async()=>{await withServer((_req,res)=>res.end('Foreign listener'),async origin=>{await expect(runLinkCheck({LINK_CHECK_PORT:new URL(origin).port,LOOPLABS_TENANT_WEB_CONFIG:'/unavailable'})).rejects.toThrow('already occupied');});});
