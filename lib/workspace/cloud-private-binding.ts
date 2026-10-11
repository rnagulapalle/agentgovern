import { constants } from "node:fs";
import { open } from "node:fs/promises";
// An explicit server-owned file is only configuration. The provider adapter must
// separately validate exact scope, current credential lifetime and native access.
// This reader neither acquires credentials nor grants execution authority.
export async function readPrivateDiscoveryBinding(path: string | undefined): Promise<unknown> {
  try {
    if (!path || !path.startsWith("/") || path.split("/").includes("..")) throw Error();
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat(), uid = process.getuid?.();
      if (uid === undefined || !before.isFile() || before.uid !== uid || (before.mode & 0o077) !== 0 || before.nlink !== 1 || before.size > 65536) throw Error();
      const bytes = Buffer.alloc(65537), read = await file.read(bytes, 0, bytes.length, 0);
      if (read.bytesRead > 65536 || read.bytesRead !== before.size) throw Error();
      const after = await file.stat();
      if (!after.isFile() || after.uid !== uid || (after.mode & 0o077) !== 0 || after.nlink !== 1 || after.size > 65536
        || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error();
      return JSON.parse(bytes.subarray(0, read.bytesRead).toString("utf8"));
    } finally { await file.close(); }
  } catch { throw Error("Private read-only cloud binding unavailable"); }
}
