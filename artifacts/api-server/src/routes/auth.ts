import { Router, type IRouter } from "express";
import { eq, or } from "drizzle-orm";
import { db, users } from "@workspace/db";
import {
  createSession,
  destroySession,
  getAuthenticatedUser,
  getBearerToken,
  hashPassword,
  requireUser,
  serializeUser,
  verifyPassword,
  randomUUID,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res, next) => {
  try {
    const username = String(req.body.username ?? "").trim().toLowerCase();
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const displayName = String(req.body.displayName ?? username).trim();

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      res.status(400).json({ error: "Le nom d'utilisateur doit contenir 3 à 30 lettres, chiffres ou _." });
      return;
    }
    if (!email.includes("@") || password.length < 8 || displayName.length < 2) {
      res.status(400).json({ error: "Email, nom affiché et mot de passe de 8 caractères sont requis." });
      return;
    }
    const existing = await db.select({ id: users.id }).from(users).where(or(eq(users.username, username), eq(users.email, email))).limit(1);
    if (existing.length) {
      res.status(409).json({ error: "Ce nom d'utilisateur ou cet email est déjà utilisé." });
      return;
    }
    const user = {
      id: randomUUID(),
      username,
      email,
      displayName,
      passwordHash: hashPassword(password),
      bio: "",
      avatarUrl: null,
    };
    await db.insert(users).values(user);
    const token = await createSession(user.id);
    res.status(201).json({ token, user: serializeUser({ ...user, createdAt: new Date() }) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const login = String(req.body.login ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const rows = await db.select().from(users).where(or(eq(users.email, login), eq(users.username, login))).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Identifiants invalides." });
      return;
    }
    const token = await createSession(user.id);
    res.json({ token, user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/auth/logout", async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (token) await destroySession(token);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (user) res.json({ user: serializeUser(user) });
  } catch (error) {
    next(error);
  }
});

export default router;