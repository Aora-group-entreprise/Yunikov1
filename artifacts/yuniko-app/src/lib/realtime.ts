import type { QueryClient } from "@tanstack/react-query";

const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "/api";

type RealtimeEvent = {
  type?: string;
  post_id?: string;
  notification_id?: string;
  conversation_id?: string;
  message_id?: string;
  story_id?: string;
  target_user_id?: string;
  actor_id?: string;
};

function invalidate(queryClient: QueryClient, key: string[]) {
  void queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
}

export function startRealtime(queryClient: QueryClient) {
  let source: EventSource | null = null;
  const seen = new Set<string>();
  let reconnectTimer: number | undefined;

  const connect = () => {
    if (source) source.close();
    source = new EventSource(API + "/realtime", { withCredentials: true });

    const onEvent = (event: MessageEvent<string>) => {
      let payload: RealtimeEvent;
      try {
        payload = JSON.parse(event.data) as RealtimeEvent;
      } catch {
        return;
      }

      const fingerprint = [
        payload.type ?? "",
        payload.post_id ?? "",
        payload.notification_id ?? "",
        payload.conversation_id ?? "",
        payload.message_id ?? "",
        payload.story_id ?? "",
        payload.actor_id ?? "",
      ].join(":");

      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      if (seen.size > 256) seen.delete(seen.values().next().value as string);

      switch (payload.type) {
        case "feed.invalidate":
          invalidate(queryClient, ["feed"]);
          invalidate(queryClient, ["posts"]);
          break;
        case "notification.changed":
          invalidate(queryClient, ["notifications"]);
          break;
        case "message.changed":
        case "message.deleted":
          invalidate(queryClient, ["messages"]);
          invalidate(queryClient, ["conversations"]);
          if (payload.conversation_id) {
            invalidate(queryClient, ["messages", payload.conversation_id]);
          }
          break;
        case "story.changed":
        case "story.viewed":
          invalidate(queryClient, ["stories"]);
          if (payload.story_id) invalidate(queryClient, ["stories", payload.story_id]);
          break;
        case "like.changed":
        case "comment.changed":
        case "save.changed":
        case "share.changed":
        case "follow.changed":
        case "follow.removed":
          invalidate(queryClient, ["posts"]);
          invalidate(queryClient, ["notifications"]);
          break;
        default:
          break;
      }
    };

    source.addEventListener("realtime", onEvent);
    source.onerror = () => {
      source?.close();
      source = null;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(connect, 5_000);
    };
  };

  connect();

  return () => {
    window.clearTimeout(reconnectTimer);
    source?.close();
    source = null;
  };
}
