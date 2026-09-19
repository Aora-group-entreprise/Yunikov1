import { Router, type IRouter } from "express";
import { pool, setRlsUser } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/realtime", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const conversationId = req.query.conversationId ? String(req.query.conversationId) : null;
  const client = await pool.connect();

  try {
    await setRlsUser(client, req.userId);

    if (conversationId) {
      const member = await client.query(
        "select 1 from conversation_members where conversation_id = $1 and user_id = $2",
        [conversationId, req.userId],
      );
      if (!member.rows[0]) {
        res.status(403).json({ error: "conversation_forbidden" });
        client.release();
        return;
      }
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: ready\ndata: {}\n\n");

    await client.query("listen yuniko_realtime_events");

    let closed = false;
    const onNotification = async (notification: { channel?: string; payload?: string }) => {
      if (closed || notification.channel !== "yuniko_realtime_events") return;

      try {
        const payload = JSON.parse(notification.payload ?? "{}") as Record<string, unknown>;
        const targetUserId = typeof payload.target_user_id === "string" ? payload.target_user_id : null;
        const eventConversationId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;

        if (targetUserId && targetUserId !== req.userId) return;
        if (conversationId && eventConversationId && eventConversationId !== conversationId) return;
        if (!conversationId && eventConversationId && !targetUserId) return;

        res.write(
          "event: realtime\ndata: " +
          JSON.stringify({ type: payload.type, ...payload }) +
          "\n\n",
        );
      } catch {
        // Ignore malformed database notifications.
      }
    };

    client.on("notification", onNotification);
    const heartbeat = setInterval(() => {
      if (!closed) res.write(": ping\n\n");
    }, 25_000);

    const close = async () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      client.removeListener("notification", onNotification);
      await client.query("unlisten yuniko_realtime_events").catch(() => undefined);
      client.release();
    };

    req.on("close", () => {
      void close();
    });
  } catch (error) {
    client.release();
    next(error);
  }
});

export default router;
