import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  createDirectConversation,
  createGroupConversation,
  listConversations,
  listMessages,
  sendMessage,
  markConversationRead,
  setConversationState,
  manageGroupMember,
} from "../services/messaging.service";

const router: IRouter = Router();

function userId(req: AuthenticatedRequest): string {
  if (!req.userId) throw new Error("unauthorized");
  return req.userId;
}

function handleError(error: unknown, res: Parameters<Parameters<IRouter["post"]>[1]>[1], next: Parameters<Parameters<IRouter["post"]>[1]>[2]) {
  if (error instanceof Error) {
    const map: Record<string, number> = {
      unauthorized: 401, cannot_message_self: 400, blocked_relationship: 403,
      group_requires_three_members: 400, conversation_not_found: 404,
      request_must_be_accepted: 409, message_not_found: 404,
      group_admin_required: 403, group_required: 400,
      already_member: 409, admin_cannot_remove_self: 400,
    };
    const status = map[error.message];
    if (status) { res.status(status).json({ error: error.message }); return; }
  }
  next(error);
}

router.post("/me/conversations/dm", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const targetUserId = String(req.body?.targetUserId ?? "");
    if (!targetUserId) { res.status(400).json({ error: "target_user_required" }); return; }
    res.status(201).json({ conversationId: await createDirectConversation(userId(req), targetUserId) });
  } catch (error) { handleError(error, res, next); }
});

router.post("/me/conversations/group", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const members = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    res.status(201).json({ conversationId: await createGroupConversation(userId(req), members) });
  } catch (error) { handleError(error, res, next); }
});

router.get("/me/conversations", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try { res.json(await listConversations(userId(req))); } catch (error) { handleError(error, res, next); }
});

router.get("/me/conversations/:conversationId/messages", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    res.json(await listMessages(userId(req), String(req.params.conversationId), req.query.before ? String(req.query.before) : undefined, Number.isFinite(limit) ? limit : 50));
  } catch (error) { handleError(error, res, next); }
});

router.post("/me/conversations/:conversationId/messages", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const payload = req.body ?? {};
    if (!payload.body && !payload.mediaUrl) { res.status(400).json({ error: "message_content_required" }); return; }
    res.status(201).json(await sendMessage({
      userId: userId(req),
      conversationId: String(req.params.conversationId),
      messageId: payload.id ? String(payload.id) : undefined,
      body: payload.body ? String(payload.body) : null,
      mediaUrl: payload.mediaUrl ? String(payload.mediaUrl) : null,
      replyToId: payload.replyToId ? String(payload.replyToId) : null,
      kind: payload.kind,
      metadata: typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {},
    }));
  } catch (error) { handleError(error, res, next); }
});

router.post("/me/conversations/:conversationId/read", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const messageId = String(req.body?.messageId ?? "");
    if (!messageId) { res.status(400).json({ error: "message_required" }); return; }
    res.json(await markConversationRead(userId(req), String(req.params.conversationId), messageId));
  } catch (error) { handleError(error, res, next); }
});

router.patch("/me/conversations/:conversationId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.json(await setConversationState(userId(req), String(req.params.conversationId), {
      archived: body.archived === undefined ? undefined : Boolean(body.archived),
      mutedUntil: body.mutedUntil === null ? null : body.mutedUntil ? String(body.mutedUntil) : undefined,
    }));
  } catch (error) { handleError(error, res, next); }
});

router.post("/me/conversations/:conversationId/members/:targetUserId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const action = req.body?.action === "remove" ? "remove" : "add";
    await manageGroupMember(userId(req), String(req.params.conversationId), String(req.params.targetUserId), action);
    res.status(204).end();
  } catch (error) { handleError(error, res, next); }
});

export default router;
