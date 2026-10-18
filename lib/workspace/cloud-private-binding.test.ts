import { expect, test } from "vitest";
import { mkdtemp, writeFile, chmod, symlink, link, unlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
const command = promisify(execFile);
test("reads only an explicit private regular server-owned file without conferring provider or execution authority", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-private-binding-")), path = join(dir, "binding.json");
  try {
    const value = { scope: { connectionId: "reviewed" }, credential: "DUMMY_TEST_VALUE" };
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    expect(await readPrivateDiscoveryBinding(path)).toEqual(value);
    await writeFile(path, "null"); expect(await readPrivateDiscoveryBinding(path)).toBe(null);
    // Returning unknown keeps exact provider contracts at the provider boundary.
    await writeFile(path, '"not-a-provider-contract"'); expect(await readPrivateDiscoveryBinding(path)).toBe("not-a-provider-contract");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("refuses missing, relative, traversal, symlink, hard-linked, broad-permission, oversized and malformed bindings with sanitized errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-private-binding-")), path = join(dir, "binding.json"), linked = join(dir, "linked.json");
  async function denied(candidate: string | undefined) {
    await expect(readPrivateDiscoveryBinding(candidate)).rejects.toThrow(/^Private read-only cloud binding unavailable$/);
  }
  try {
    for (const candidate of [undefined, "", "relative.json", join(dir, "missing"), `${dir}/../private`, dir]) await denied(candidate);
    await writeFile(path, '{"token":"DUMMY_SECRET"}', { mode: 0o600 });
    for (const mode of [0o644, 0o640, 0o606]) { await chmod(path, mode); await denied(path); }
    await chmod(path, 0o600); await symlink(path, linked); await denied(linked); await unlink(linked);
    await link(path, linked); await denied(path); await denied(linked); await unlink(linked);
    await writeFile(path, " ".repeat(65537)); await denied(path);
    await writeFile(path, '{"token":"DUMMY_SECRET"'); await denied(path);
    const socketLike = join(dir, "fifo"); await command("mkfifo", [socketLike]); await chmod(socketLike, 0o600); await denied(socketLike);
    const directory = join(dir, "directory"); await mkdir(directory, { mode: 0o700 }); await denied(directory);
    await writeFile(path, JSON.stringify({ renewed: true })); expect(await readPrivateDiscoveryBinding(path)).toEqual({ renewed: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
