import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db, bookmarks, comments, follows, likes, notifications, posts, users } from "@workspace/db";
import { randomUUID, requireUser, serializeUser } from "../lib/auth";

const router: IRouter = Router();

function publicPost(row: typeof posts.$inferSelect, user: typeof users.$inferSelect, metrics: { likes: number; comments: number; liked: boolean; bookmarked: boolean }) {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    caption: row.caption,
    location: row.location,
    createdAt: row.createdAt,
    user: serializeUser(user),
    ...metrics,
  };
}

router.get("/feed", async (req, res, next) => {
  try {
    const current = await requireUser(req, res);
    if (!current) return;
    const rows = await db.select({ post: posts, user: users }).from(posts).innerJoin(users, eq(posts.userId, users.id)).orderBy(desc(posts.createdAt)).limit(40);
    const result = await Promise.all(rows.map(async ({ post, user }) => {
      const [likeRows, commentRows, myLike, myBookmark] = await Promise.all([
        db.select({ total: count() }).from(likes).where(eq(likes.postId, post.id)),
        db.select({ total: count() }).from(comments).where(eq(comments.postId, post.id)),
        db.select({ userId: likes.userId }).from(likes).where(and(eq(likes.postId, post.id), eq(likes.userId, current.id))).limit(1),
        db.select({ userId: bookmarks.userId }).from(bookmarks).where(and(eq(bookmarks.postId, post.id), eq(bookmarks.userId, current.id))).limit(1),
      ]);
      return publicPost(post, user, {
        likes: Number(likeRows[0]?.total ?? 0),
        comments: Number(commentRows[0]?.total ?? 0),
        liked: myLike.length > 0,
        bookmarked: myBookmark.length > 0,
      });
    }));
    res.json({ posts: result });
  } catch (error) {
    next(error);
  }
});

router.post("/posts", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const imageUrl = String(req.body.imageUrl ?? "").trim();
    const caption = String(req.body.caption ?? "").trim();
    const location = String(req.body.location ?? "").trim() || null;
    try {
      new URL(imageUrl);
    } catch {
      res.status(400).json({ error: "Une URL d'image valide est requise." });
      return;
    }
    if (caption.length > 500) {
      res.status(400).json({ error: "La légende ne peut pas dépasser 500 caractères." });
      return;
    }
    const post = { id: randomUUID(), userId: user.id, imageUrl, caption, location };
    await db.insert(posts).values(post);
    res.status(201).json({ post: publicPost({ ...post, createdAt: new Date() }, user, { likes: 0, comments: 0, liked: false, bookmarked: false }) });
  } catch (error) {
    next(error);
  }
});

router.post("/posts/:postId/like", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const postId = req.params.postId;
    const existing = await db.select().from(likes).where(and(eq(likes.postId, postId), eq(likes.userId, user.id))).limit(1);
    if (existing.length) await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, user.id)));
    else {
      await db.insert(likes).values({ postId, userId: user.id });
      const post = (await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId)).limit(1))[0];
      if (post && post.userId !== user.id) await db.insert(notifications).values({ id: randomUUID(), userId: post.userId, actorId: user.id, type: "like", postId });
    }
    const total = await db.select({ total: count() }).from(likes).where(eq(likes.postId, postId));
    res.json({ liked: !existing.length, likes: Number(total[0]?.total ?? 0) });
  } catch (error) {
    next(error);
  }
});

router.post("/posts/:postId/bookmark", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const postId = req.params.postId;
    const existing = await db.select().from(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, user.id))).limit(1);
    if (existing.length) await db.delete(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, user.id)));
    else await db.insert(bookmarks).values({ postId, userId: user.id });
    res.json({ bookmarked: !existing.length });
  } catch (error) {
    next(error);
  }
});

router.get("/posts/:postId/comments", async (req, res, next) => {
  try {
    const current = await requireUser(req, res);
    if (!current) return;
    const rows = await db.select({ comment: comments, user: users }).from(comments).innerJoin(users, eq(comments.userId, users.id)).where(eq(comments.postId, req.params.postId)).orderBy(asc(comments.createdAt)).limit(100);
    res.json({ comments: rows.map(({ comment, user }) => ({ ...comment, user: serializeUser(user) })) });
  } catch (error) {
    next(error);
  }
});

router.post("/posts/:postId/comments", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const body = String(req.body.body ?? "").trim();
    if (!body || body.length > 500) {
      res.status(400).json({ error: "Le commentaire doit contenir entre 1 et 500 caractères." });
      return;
    }
    const postId = req.params.postId;
    const post = (await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId)).limit(1))[0];
    if (!post) {
      res.status(404).json({ error: "Publication introuvable." });
      return;
    }
    const comment = { id: randomUUID(), postId, userId: user.id, body };
    await db.insert(comments).values(comment);
    if (post.userId !== user.id) await db.insert(notifications).values({ id: randomUUID(), userId: post.userId, actorId: user.id, type: "comment", postId });
    res.status(201).json({ comment: { ...comment, createdAt: new Date(), user: serializeUser(user) } });
  } catch (error) {
    next(error);
  }
});

router.get("/users/search", async (req, res, next) => {
  try {
    const current = await requireUser(req, res);
    if (!current) return;
    const query = String(req.query.q ?? "").trim();
    if (!query) {
      res.json({ users: [] });
      return;
    }
    const result = await db.select().from(users).where(or(ilike(users.username, `%${query}%`), ilike(users.displayName, `%${query}%`))).limit(20);
    res.json({ users: result.map(serializeUser) });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:username", async (req, res, next) => {
  try {
    const current = await requireUser(req, res);
    if (!current) return;
    const user = (await db.select().from(users).where(eq(users.username, req.params.username.toLowerCase())).limit(1))[0];
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable." });
      return;
    }
    const [followerCount, followingCount, postCount, following] = await Promise.all([
      db.select({ total: count() }).from(follows).where(eq(follows.followingId, user.id)),
      db.select({ total: count() }).from(follows).where(eq(follows.followerId, user.id)),
      db.select({ total: count() }).from(posts).where(eq(posts.userId, user.id)),
      db.select().from(follows).where(and(eq(follows.followerId, current.id), eq(follows.followingId, user.id))).limit(1),
    ]);
    const userPosts = await db.select().from(posts).where(eq(posts.userId, user.id)).orderBy(desc(posts.createdAt)).limit(60);
    res.json({
      user: {
        ...serializeUser(user),
        followers: Number(followerCount[0]?.total ?? 0),
        following: Number(followingCount[0]?.total ?? 0),
        posts: Number(postCount[0]?.total ?? 0),
        isFollowing: following.length > 0,
      },
      posts: userPosts.map((post) => ({ id: post.id, imageUrl: post.imageUrl, caption: post.caption, location: post.location, createdAt: post.createdAt })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/users/:userId/follow", async (req, res, next) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const followingId = req.params.userId;
    if (followingId === user.id) {
      res.status(400).json({ error: "Vous ne pouvez pas vous suivre vous-même." });
      return;
    }
    const existing = await db.select().from(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, followingId))).limit(1);
    if (existing.length) await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, followingId)));
    else {
      await db.insert(follows).values({ followerId: user.id, followingId });
      await db.insert(notifications).values({ id: randomUUID(), userId: followingId, actorId: user.id, type: "follow" });
    }
    res.json({ following: !existing.length });
  } catch (error) {
    next(error);
  }
});

export default router;