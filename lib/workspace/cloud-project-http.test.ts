import { expect, test, vi } from "vitest";
import { boundedProjectJson, projectCredential } from "./cloud-project-http";
test("fixed caller-selected GET uses manual redirects and accepts bounded JSON objects", async () => {
  const controller = new AbortController(), fetcher = vi.fn(async () => Response.json({ data: [] }));
  expect(await boundedProjectJson("https://native.example.test/agents", "DUMMY_TEST_TOKEN", controller.signal, fetcher)).toEqual({ data: [] });
  expect(fetcher).toHaveBeenCalledWith("https://native.example.test/agents", { method: "GET", redirect: "manual", headers: { Authorization: "Bearer DUMMY_TEST_TOKEN", Accept: "application/json" }, signal: controller.signal });
});
test("aborted request refuses before network; status, redirect, content-type, size and malformed bodies are sanitized", async () => {
  const controller = new AbortController(); controller.abort(); const unused = vi.fn();
  await expect(boundedProjectJson("https://native.example.test/agents", "DUMMY_TEST_TOKEN", controller.signal, unused)).rejects.toThrow(/^Read-only cloud response unavailable$/); expect(unused).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  for (const response of [new Response("PRIVATE", { status: 403 }), new Response(null, { status: 302, headers: { location: "https://foreign.example.test" } }), new Response("PRIVATE", { headers: { "content-type": "text/plain" } }), new Response('{}', { headers: { "content-type": "application/json", "content-length": "1048577" } }), new Response('{}', { headers: { "content-type": "application/json", "content-length": "bad" } }), new Response(null, { headers: { "content-type": "application/json" } }), Response.json([]), Response.json(null), new Response('PRIVATE', { headers: { "content-type": "application/json" } }), new Response(' '.repeat(1048577), { headers: { "content-type": "application/json" } })]) {
    await expect(boundedProjectJson("https://native.example.test/agents", "DUMMY_TEST_TOKEN", signal, vi.fn(async () => response))).rejects.toThrow(/^Read-only cloud response unavailable$/);
  }
});

test("shared broker deadline refuses pre-aborted and stalled acquisition without admitting a credential", async () => {
  const already = new AbortController(); already.abort(); const unused = vi.fn();
  await expect(projectCredential(unused, already.signal)).rejects.toThrow(); expect(unused).not.toHaveBeenCalled();
  const controller = new AbortController(), acquire = vi.fn(async () => new Promise(() => {}));
  const pending = projectCredential(acquire, controller.signal); await Promise.resolve(); controller.abort();
  await expect(pending).rejects.toThrow(/^Discovery credential deadline reached$/); expect(acquire).toHaveBeenCalledTimes(1);
});
