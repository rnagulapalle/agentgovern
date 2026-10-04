import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { ControlError } from "../durable/contracts";
import { digest } from "./identity";
export function passwordHash(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
const DUMMY = passwordHash(
  "unavailable-account",
  "00000000000000000000000000000000",
);
export function passwordMatches(password: string, stored: string) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, hash] = stored.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(hash || ""))
    return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hash, "hex"),
  );
}
export async function throttle(
  c: PoolClient,
  key: string,
  limit: number,
  seconds: number,
) {
  const { rows } = await c.query(
    "INSERT INTO ll_access_attempts(key,count) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ll_access_attempts.window_start<now()-($2*interval '1 second') THEN 1 ELSE ll_access_attempts.count+1 END, window_start=CASE WHEN ll_access_attempts.window_start<now()-($2*interval '1 second') THEN now() ELSE ll_access_attempts.window_start END RETURNING count",
    [key, seconds],
  );
  return rows[0].count <= limit;
}
export async function signIn(db: Pool, value: Record<string, unknown>) {
  if (
    Object.keys(value).some((k) => !["email", "password"].includes(k)) ||
    typeof value.email !== "string" ||
    typeof value.password !== "string" ||
    value.email.length > 254 ||
    value.password.length > 256 ||
    !value.password
  )
    throw new ControlError(400, "Enter your email and password.");
  const email = value.email.trim().toLowerCase();
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const global = await throttle(c, "login-global", 120, 300);
    const account = await throttle(c, `login:${digest(email)}`, 8, 900);
    if (!global || !account) {
      await c.query("COMMIT");
      throw new ControlError(
        429,
        "Too many sign-in attempts. Please try again later.",
      );
    }
    const { rows } = await c.query(
      "SELECT email,password_hash,active FROM ll_members WHERE email=$1",
      [email],
    );
    const match = passwordMatches(
      value.password,
      rows[0]?.password_hash || DUMMY,
    );
    if (!match || !rows[0]?.active) {
      await c.query("COMMIT");
      throw new ControlError(401, "Email or password is incorrect.");
    }
    const token = randomBytes(32).toString("base64url");
    await c.query(
      "DELETE FROM ll_sessions WHERE email=$1 AND expires_at<=now()",
      [email],
    );
    await c.query(
      "INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '8 hours')",
      [digest(token), email],
    );
    await c.query("COMMIT");
    return token;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
