import crypto from "node:crypto";
import { pool } from "@workspace/db";

export type RegisterInput = { email: string; password: string; username: string };
export type AuthSession = { userId: string; sessionId: string; accessToken: string; refreshToken: string };

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN = 8;

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("auth_session_secret_not_configured");
  return value;
}
function hashToken(token: string): string { return crypto.createHash("sha256").update(token).digest("hex"); }
function signAccessToken(userId: string, sessionId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: userId, sid: sessionId, iat: now, exp: now + ACCESS_TTL_SECONDS })).toString("base64url");
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}
export function verifyAccessToken(token: string): { userId: string; sessionId: string } | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const body = `${header}.${payload}`;
    const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; sid?: string; exp?: number };
    if (!decoded.sub || !decoded.sid || !decoded.exp || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    return { userId: decoded.sub, sessionId: decoded.sid };
  } catch { return null; }
}
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 2 }, (error, key) => error ? reject(error) : resolve(key)));
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, saltText, hashText] = encoded.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  const actual = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 2 }, (error, key) => error ? reject(error) : resolve(key)));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN) throw new Error("password_too_short");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error("password_too_weak");
}
function validateUsername(username: string): void { if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) throw new Error("invalid_username"); }
function newRefreshToken(): string { return crypto.randomBytes(48).toString("base64url"); }
async function createSession(userId: string, ip?: string, userAgent?: string): Promise<AuthSession> {
  const refreshToken = newRefreshToken();
  const sessionId = crypto.randomUUID();
  await pool.query(`insert into yunikov_v1.auth_sessions (id,user_id,refresh_token_hash,ip,user_agent,expires_at) values ($1,$2,$3,$4,$5,$6)`, [sessionId, userId, hashToken(refreshToken), ip ?? null, userAgent ?? null, new Date(Date.now() + REFRESH_TTL_MS)]);
  return { userId, sessionId, accessToken: signAccessToken(userId, sessionId), refreshToken };
}

export async function registerUser(input: RegisterInput, meta: { ip?: string; userAgent?: string } = {}): Promise<AuthSession> {
  validateUsername(input.username); validatePassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const userResult = await client.query<{ id: string }>(`insert into yunikov_v1.users (email,password_hash) values (lower($1),$2) returning id`, [input.email.trim(), await hashPassword(input.password)]);
    const userId = userResult.rows[0].id;
    await client.query(`insert into yunikov_v1.profiles (id,username,display_name) values ($1,$2,$2)`, [userId, input.username]);
    await client.query(`insert into yunikov_v1.events (user_id,type) values ($1,'auth.user.created'),($1,'profile.created')`, [userId]);
    await client.query("commit");
    return createSession(userId, meta.ip, meta.userAgent);
  } catch (error) {
    await client.query("rollback");
    if ((error as { code?: string }).code === "23505") throw new Error("account_already_exists");
    throw error;
  } finally { client.release(); }
}

export async function signIn(identifier: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<AuthSession> {
  const result = await pool.query<{ id: string; password_hash: string | null; status: string }>(`select u.id,u.password_hash,u.status from yunikov_v1.users u left join yunikov_v1.profiles p on p.id=u.id where lower(u.email)=lower($1) or lower(p.username)=lower($1) limit 1`, [identifier.trim()]);
  const row = result.rows[0];
  const valid = !!row?.password_hash && row.status === "active" && await verifyPassword(password, row.password_hash);
  await pool.query(`insert into yunikov_v1.login_events (user_id,ip,user_agent,is_new_device) values ($1,$2,$3,false)`, [valid ? row.id : null, meta.ip ?? null, meta.userAgent ?? null]);
  if (!valid) throw new Error("invalid_credentials");
  await pool.query(`insert into yunikov_v1.events (user_id,type) values ($1,'auth.login.success')`, [row.id]);
  return createSession(row.id, meta.ip, meta.userAgent);
}
export async function signOut(sessionId: string, scope: "current" | "all"): Promise<void> {
  if (scope === "all") await pool.query(`update yunikov_v1.auth_sessions set revoked_at=now() where user_id=(select user_id from yunikov_v1.auth_sessions where id=$1) and revoked_at is null`, [sessionId]);
  else await pool.query(`update yunikov_v1.auth_sessions set revoked_at=now() where id=$1`, [sessionId]);
}
export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const result = await pool.query<{ id: string; user_id: string }>(`select id,user_id from yunikov_v1.auth_sessions where refresh_token_hash=$1 and revoked_at is null and expires_at>now()`, [hashToken(refreshToken)]);
  const row = result.rows[0]; if (!row) throw new Error("invalid_refresh_token");
  await pool.query(`update yunikov_v1.auth_sessions set revoked_at=now() where id=$1`, [row.id]);
  return createSession(row.user_id);
}
export async function requestPasswordReset(identifier: string): Promise<void> {
  const result = await pool.query<{ id: string }>(`select u.id from yunikov_v1.users u left join yunikov_v1.profiles p on p.id=u.id where lower(u.email)=lower($1) or lower(p.username)=lower($1) limit 1`, [identifier.trim()]);
  if (result.rows[0]) await pool.query(`insert into yunikov_v1.events (user_id,type) values ($1,'auth.login.failed')`, [result.rows[0].id]);
}
