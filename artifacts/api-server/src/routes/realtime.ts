import { Router, type IRouter } from "express";
import { pool, setRlsUser } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/realtime", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  if (!req.userId) { res.status(401).json({ error: "unauthorized" }); return; }
  const conversationId = req.query.conversationId ? String(req.query.conversationId) : null;
  const client = await pool.connect();
  try {
    await setRlsUser(client, req.userId);
    if (conversationId) {
      const member = await client.query("select 1 from conversation_members where conversation_id=$1 and user_id=$2", [conversationId, req.userId]);
      if (!member.rows[0]) { res.status(403).json({ error: "conversation_forbidden" }); return; }
    }
    res.status(200); res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.flushHeaders();
    res.write("event: ready\\ndata: {}\\n\\n");
    await client.query("listen yuniko_message_events");
    await client.query("listen yuniko_story_events");
    const onNotification = (notification: { channel?: string; payload?: string }) => {
      try {
        const payload = JSON.parse(notification.payload ?? "{}") as Record<string, unknown>;
        if (notification.channel === "yuniko_message_events" && conversationId && payload.conversation_id !== conversationId) return;
        res.write("event: " + (notification.channel === "yuniko_story_events" ? "story" : "message") + "\\ndata: " + JSON.stringify(payload) + "\\n\\n");
    } catch { /* malformed notifications are ignored */ }
    };
    client.on("notification", onNotification);
    const heartbeat = setInterval(() => res.write(": ping\\n\\n"), 25_000);
    const close = async () => { clearInterval(heartbeat); client.removeListener("notification", onNotification); await client.query("unlisten yuniko_message_events").catch(()=>undefined); await client.query("unlisten yuniko_story_events").catch(()=>undefined); client.release(); };
    req.on("close", () => { void close(); });
  } catch (error) { client.release(); next(error); }
});

export default router;