import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, MessageCircle, Search, Send } from "lucide-react";

type InboxUser = { id: string; username: string; displayName: string; avatar?: string | null };
type LocalMessage = { id: string; senderId: string; body: string; createdAt: number };
type LocalConversation = { id: string; user: InboxUser; messages: LocalMessage[] };
type LocalNotification = { id: string; type: "like" | "comment" | "follow" | "message" | string; actor: InboxUser; postId?: string; read: boolean; createdAt: number };

const MSG_KEY = "yuniko-local-conversations";
const NOTIF_KEY = "yuniko-local-notifications";
const contacts: InboxUser[] = [
  { id: "1", username: "sofia.park", displayName: "Sofia Park", avatar: "/scene-rooftop.jpg" },
  { id: "2", username: "noah.reyes", displayName: "Noah Reyes", avatar: "/scene-dj.jpg" },
  { id: "3", username: "lina.rose", displayName: "Lina Rose", avatar: "/scene-flower.jpg" },
];

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function formatTime(value: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} j`;
}
function Avatar({ user, small = false }: { user: InboxUser; small?: boolean }) {
  const size = small ? "h-9 w-9" : "h-10 w-10";
  return user.avatar
    ? <img src={user.avatar} alt="" className={`${size} rounded-full object-cover ring-2 ring-white/10`} />
    : <div className={`${size} rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold ring-2 ring-white/10`}>{user.displayName.slice(0, 1).toUpperCase()}</div>;
}
function initialConversations(currentUser: InboxUser): LocalConversation[] {
  try {
    const saved = JSON.parse(localStorage.getItem("yuniko-demo-state") || "null");
    const source = saved?.messages as Record<string, string[]> | undefined;
    if (!source) return [];
    return contacts.filter(user => Array.isArray(source[user.id])).map(user => ({
      id: [currentUser.id, user.id].sort().join("_"),
      user,
      messages: source[user.id].map((body, index) => ({ id: `legacy-${user.id}-${index}`, senderId: user.id, body, createdAt: Date.now() - (source[user.id].length - index) * 60000 })),
    }));
  } catch { return []; }
}

export function MessagesPage({ currentUser }: { currentUser: InboxUser }) {
  const [conversations, setConversations] = useState<LocalConversation[]>(() => load(MSG_KEY, initialConversations(currentUser)));
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const selected = conversations.find(c => c.id === selectedId) ?? conversations[0];
  const matches = useMemo(() => contacts.filter(c => c.id !== currentUser.id && (c.displayName.toLowerCase().includes(query.trim().toLowerCase()) || c.username.toLowerCase().includes(query.trim().toLowerCase()))), [query, currentUser.id]);
  useEffect(() => { if (!selectedId && conversations[0]) setSelectedId(conversations[0].id); }, [conversations, selectedId]);
  useEffect(() => { save(MSG_KEY, conversations); }, [conversations]);
  function openUser(user: InboxUser) {
    const id = [currentUser.id, user.id].sort().join("_");
    if (!conversations.some(c => c.id === id)) setConversations(items => [...items, { id, user, messages: [] }]);
    setSelectedId(id); setQuery("");
  }
  function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || text.length > 2000 || !selected) return;
    setConversations(items => items.map(c => c.id === selected.id ? { ...c, messages: [...c.messages, { id: `m-${Date.now()}`, senderId: currentUser.id, body: text, createdAt: Date.now() }] } : c));
    setBody("");
  }
  return <section className="mx-auto max-w-4xl px-4 py-6"><div className="flex items-center gap-3"><MessageCircle /><h1 className="text-2xl font-bold">Messages</h1></div><div className="mt-5 grid min-h-[560px] overflow-hidden rounded-3xl border border-white/10 bg-white/[.04] md:grid-cols-[250px_1fr]"><aside className="border-b border-white/10 md:border-b-0 md:border-r"><div className="border-b border-white/10 p-3"><div className="flex items-center gap-2 rounded-xl bg-black/20 px-3"><Search size={16} className="text-white/40" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nouvelle conversation..." className="w-full bg-transparent py-2 text-sm outline-none" /></div>{query && matches.map(user => <button key={user.id} onClick={() => openUser(user)} className="mt-2 flex w-full items-center gap-2 rounded-xl bg-white/10 p-2 text-left">{<Avatar user={user} small />}<span className="text-sm">{user.displayName}</span></button>)}</div><div className="max-h-80 overflow-y-auto p-2">{conversations.map(c => <button key={c.id} onClick={() => setSelectedId(c.id)} className={`flex w-full items-center gap-2 rounded-xl p-2 text-left ${selected?.id === c.id ? "bg-white/10" : "hover:bg-white/5"}`}>{<Avatar user={c.user} small />}<span className="min-w-0"><b className="block truncate text-sm">{c.user.displayName}</b><small className="block truncate text-white/40">{c.messages.at(-1)?.body || "Nouvelle conversation"}</small></span></button>)}</div></aside><div className="flex min-h-[420px] flex-col">{selected ? <><div className="flex items-center gap-3 border-b border-white/10 p-3">{<Avatar user={selected.user} small />}<div><b className="block text-sm">{selected.user.displayName}</b><small className="text-white/40">@{selected.user.username}</small></div></div><div className="flex-1 space-y-2 overflow-y-auto p-4">{selected.messages.map(message => <div key={message.id} className={`flex ${message.senderId === currentUser.id ? "justify-end" : "justify-start"}`}><p className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${message.senderId === currentUser.id ? "bg-gradient-to-r from-pink-500 to-violet-600" : "bg-white/10"}`}>{message.body}</p></div>)}{!selected.messages.length && <p className="py-16 text-center text-sm text-white/35">Écris le premier message.</p>}</div><form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3"><input value={body} onChange={e => setBody(e.target.value)} maxLength={2000} placeholder="Écrire un message..." className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none" /><button aria-label="Envoyer" className="rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-3"><Send size={17} /></button></form></> : <div className="flex flex-1 items-center justify-center text-sm text-white/40">Choisis un contact pour commencer.</div>}</div></div></section>;
}

export function NotificationsPage({ onOpenProfile }: { onOpenProfile?: (username: string) => void }) {
  const [items, setItems] = useState<LocalNotification[]>(() => load(NOTIF_KEY, []));
  useEffect(() => {
    if (items.some(item => !item.read)) {
      const next = items.map(item => ({ ...item, read: true }));
      setItems(next); save(NOTIF_KEY, next);
    }
  }, []);
  return <section className="mx-auto max-w-2xl px-4 py-6"><div className="flex items-center gap-3"><Bell /><h1 className="text-2xl font-bold">Notifications</h1></div><div className="mt-5 space-y-2">{items.map(item => <button key={item.id} onClick={() => onOpenProfile?.(item.actor.username)} className={`flex w-full items-center gap-3 rounded-2xl border border-white/10 p-3 text-left ${item.read ? "bg-white/[.03]" : "bg-pink-500/10"}`}>{<Avatar user={item.actor} small />}<p className="flex-1 text-sm"><b>{item.actor.displayName}</b>{" "}{item.type === "like" ? "a aimé ta publication." : item.type === "comment" ? "a commenté ta publication." : item.type === "follow" ? "a commencé à te suivre." : "t'a envoyé un message."}<span className="mt-1 block text-xs text-white/35">{formatTime(item.createdAt)}</span></p></button>)}</div>{!items.length && <div className="py-20 text-center text-sm text-white/35">Aucune notification pour le moment.</div>}</section>;
}

export function addLocalNotification(input: Omit<LocalNotification, "id" | "read" | "createdAt">) {
  const items = load<LocalNotification[]>(NOTIF_KEY, []);
  save(NOTIF_KEY, [{ ...input, id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, read: false, createdAt: Date.now() }, ...items].slice(0, 100));
  window.dispatchEvent(new CustomEvent("yuniko:notifications-updated"));
}
