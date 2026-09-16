import { Router, type IRouter } from "express";
import { z } from "zod";
import { registerUser, requestPasswordReset, refreshSession, signIn, signOut } from "../services/auth.service";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();
const credentials = z.object({ email: z.string().trim().email(), password: z.string().min(8), username: z.string().trim().regex(/^[A-Za-z0-9_]{3,32}$/) }).strict();
const login = z.object({ identifier: z.string().trim().min(1).max(320), password: z.string().min(1) }).strict();
const reset = z.object({ identifier: z.string().trim().min(1).max(320) }).strict();
const REFRESH_COOKIE = "yuniko_refresh";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/auth" };
function meta(req: AuthenticatedRequest) { return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined }; }
function issue(res: Parameters<Parameters<IRouter["post"]>[1]>[0], session: { refreshToken: string; accessToken: string; userId: string; sessionId: string }) { res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 }); return { userId: session.userId, sessionId: session.sessionId, accessToken: session.accessToken }; }
function authError(error: unknown): { status: number; body: { error: string } } {
  const code = error instanceof Error ? error.message : "auth_error";
  if (["password_too_short", "password_too_weak", "invalid_username"].includes(code)) return { status: 400, body: { error: code } };
  if (code === "account_already_exists") return { status: 409, body: { error: code } };
  if (["invalid_credentials", "invalid_refresh_token"].includes(code)) return { status: 401, body: { error: code } };
  if (code === "auth_session_secret_not_configured") return { status: 503, body: { error: "auth_not_configured" } };
  return { status: 500, body: { error: "auth_error" } };
}
router.post("/auth/register", async (req, res) => { const parsed = credentials.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_registration" }); return; } try { res.status(201).json(issue(res, await registerUser(parsed.data, meta(req)))); } catch (error) { const out = authError(error); res.status(out.status).json(out.body); } });
router.post("/auth/login", async (req, res) => { const parsed = login.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_login" }); return; } try { res.json(issue(res, await signIn(parsed.data.identifier, parsed.data.password, meta(req)))); } catch (error) { const out = authError(error); res.status(out.status).json(out.body); } });
router.post("/auth/refresh", async (req, res) => { const token = req.cookies?.[REFRESH_COOKIE] as string | undefined; if (!token) { res.status(401).json({ error: "invalid_refresh_token" }); return; } try { res.json(issue(res, await refreshSession(token))); } catch (error) { const out = authError(error); res.status(out.status).json(out.body); } });
router.post("/auth/logout", requireAuth, async (req: AuthenticatedRequest, res) => { try { await signOut(req.sessionId!, req.body?.scope === "all" ? "all" : "current"); res.clearCookie(REFRESH_COOKIE, cookieOptions); res.status(204).send(); } catch (error) { const out = authError(error); res.status(out.status).json(out.body); } });
router.post("/auth/password-reset", async (req, res) => { const parsed = reset.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: "invalid_reset_request" }); return; } try { await requestPasswordReset(parsed.data.identifier); } catch { /* deliberately neutral */ } res.status(202).json({ message: "If the account exists, reset instructions will be sent." }); });
export default router;
