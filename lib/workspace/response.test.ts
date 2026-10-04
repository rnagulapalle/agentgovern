import { expect, it } from "vitest";
import { workspaceJson } from "./response";

it("retains the JSON result and explicit API denial", async () => {
  await expect(
    workspaceJson(Response.json({ state: "uncertain" })),
  ).resolves.toEqual({ state: "uncertain" });
  await expect(
    workspaceJson(Response.json({ error: "Denied" }, { status: 403 })),
  ).resolves.toEqual({ error: "Denied" });
});
it("does not expose HTML proxy errors or infer that a mutation had no effect", async () => {
  for (const status of [429, 503]) {
    const response = new Response("<html>Private proxy diagnostics</html>", {
      status,
    });
    await expect(workspaceJson(response)).rejects.toThrow(
      "check saved state before another action",
    );
  }
});
