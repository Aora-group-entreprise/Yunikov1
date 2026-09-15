import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Bookmark, Heart, ImagePlus, LogOut, MessageCircle, RefreshCw, Search, Send, UserRound, Users, X } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const TOKEN_KEY = "yuniko_token";

type User = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  createdAt?: string;
};

type Post = {
  id: string;
  imageUrl: string;
  caption: string;
  location: string | null;
  createdAt: string;
  user: User;
  likes: number;
  comments: number;
  liked: boolean;
  bookmarked: boolean;
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  user: User;
};

type Profile = User & {
  followers: number;
  following: number;
  posts: number;
  isFollowing: boolean;
};
type ProfileResponse = {
  user: Profile;
  posts: Array<Pick<Post, "id" | "imageUrl" | "caption" | "location" | "createdAt">>;
};

type Tab = "feed" | "search" | "profile";

async function request<T>(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || "La requête a échoué.");
  return body;
}

function formatDate(value: string) {
  const date = new Date(value);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.displayName} className={`${dimensions} rounded-full object-cover ring-2 ring-white/10`} />
  ) : (
    <div className={`${dimensions} rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold ring-2 ring-white/10`}>
      {user.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ login: "", email: "", username: "", displayName: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? { login: form.login, password: form.password }
        : { email: form.email, username: form.username, displayName: form.displayName, password: form.password };
      const result = await request<{ token: string; user: User }>(path, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem(TOKEN_KEY, result.token);
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de se connecter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[radial-gradient(circle_at_top,#35103c,transparent_45%),#0d0b14]">
      <section className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 rounded-3xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-3xl font-black">Y</div>
          <h1 className="mt-5 text-4xl font-black tracking-tight">Yuniko</h1>
          <p className="mt-2 text-white/50">Partage ce qui te ressemble.</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[.05] p-6 shadow-2xl">
          <div className="flex rounded-xl bg-black/20 p-1 mb-6">
            {(["login", "register"] as const).map((item) => (
              <button type="button" key={item} onClick={() => { setMode(item); setError(""); }} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === item ? "bg-white/10 text-white" : "text-white/45"}`}>
                {item === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>
          {mode === "register" ? (
            <>
              <Field label="Nom affiché" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} placeholder="Ton nom" />
              <Field label="Nom d'utilisateur" value={form.username} onChange={(value) => setForm({ ...form, username: value })} placeholder="maya_chen" />
              <Field label="Email" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="toi@email.com" />
            </>
          ) : (
            <Field label="Email ou nom d'utilisateur" value={form.login} onChange={(value) => setForm({ ...form, login: value })} placeholder="maya_chen" />
          )}
          <Field label="Mot de passe" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder="8 caractères minimum" />
          {error && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button disabled={busy} className="mt-5 w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 py-3 font-bold disabled:opacity-50">
            {busy ? "Connexion..." : mode === "login" ? "Entrer dans Yuniko" : "Créer mon compte"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-white/35">Tes données sont stockées dans la base Yuniko, pas dans ce navigateur.</p>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <label className="block mb-4">
      <span className="mb-1.5 block text-xs font-semibold text-white/55">{label}</span>
      <input required type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm outline-none transition focus:border-pink-500/70" />
    </label>
  );
}

function PostCard({ post, onChange, onOpenProfile }: { post: Post; onChange: (post: Post) => void; onOpenProfile: (username: string) => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  async function toggleLike() {
    try {
      const result = await request<{ liked: boolean; likes: number }>(`/posts/${post.id}/like`, { method: "POST" });
      onChange({ ...post, liked: result.liked, likes: result.likes });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de liker.");
    }
  }

  async function toggleBookmark() {
    try {
      const result = await request<{ bookmarked: boolean }>(`/posts/${post.id}/bookmark`, { method: "POST" });
      onChange({ ...post, bookmarked: result.bookmarked });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer.");
    }
  }

  async function loadComments() {
    setShowComments(!showComments);
    if (!showComments && !comments.length) {
      const result = await request<{ comments: Comment[] }>(`/posts/${post.id}/comments`);
      setComments(result.comments);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    try {
      const result = await request<{ comment: Comment }>(`/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
      setComments([...comments, result.comment]);
      setComment("");
      onChange({ ...post, comments: post.comments + 1 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'ajouter le commentaire.");
    }
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[.045]">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => onOpenProfile(post.user.username)}><Avatar user={post.user} size="sm" /></button>
        <button onClick={() => onOpenProfile(post.user.username)} className="min-w-0 text-left">
          <p className="truncate text-sm font-bold">{post.user.displayName}</p>
          <p className="truncate text-xs text-white/45">@{post.user.username}{post.location ? ` · ${post.location}` : ""}</p>
        </button>
        <span className="ml-auto text-xs text-white/35">{formatDate(post.createdAt)}</span>
      </div>
      <img src={post.imageUrl} alt={post.caption || "Publication Yuniko"} className="aspect-square w-full object-cover bg-black/30" loading="lazy" />
      <div className="px-4 py-3">
        <div className="flex items-center gap-4">
          <button onClick={toggleLike} className={`flex items-center gap-1.5 text-sm ${post.liked ? "text-pink-400" : "text-white/70"}`}><Heart size={21} fill={post.liked ? "currentColor" : "none"} />{post.likes}</button>
          <button onClick={loadComments} className="flex items-center gap-1.5 text-sm text-white/70"><MessageCircle size={21} />{post.comments}</button>
          <button onClick={toggleBookmark} className={`ml-auto ${post.bookmarked ? "text-violet-400" : "text-white/60"}`}><Bookmark size={21} fill={post.bookmarked ? "currentColor" : "none"} /></button>
        </div>
        {post.caption && <p className="mt-3 text-sm"><span className="font-bold">{post.user.username}</span> {post.caption}</p>}
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        {showComments && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {comments.map((item) => <p key={item.id} className="text-sm"><span className="font-semibold">{item.user.username}</span> <span className="text-white/75">{item.body}</span></p>)}
              {!comments.length && <p className="text-xs text-white/35">Pas encore de commentaire.</p>}
            </div>
            <form onSubmit={submitComment} className="mt-3 flex gap-2">
              <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajouter un commentaire..." className="min-w-0 flex-1 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none" />
              <button aria-label="Publier le commentaire" className="rounded-xl bg-white/10 px-3 text-pink-300"><Send size={16} /></button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

function CreatePost({ onCreated, onClose }: { onCreated: (post: Post) => void; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ post: Post }>("/posts", { method: "POST", body: JSON.stringify({ imageUrl, caption, location }) });
      onCreated(result.post);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de publier.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#17121f] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Nouvelle publication</h2><button type="button" onClick={onClose}><X /></button></div>
        <label className="mb-4 block"><span className="mb-1.5 block text-xs font-semibold text-white/55">URL de l'image</span><input required type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." className="w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm outline-none focus:border-pink-500/70" /></label>
        <label className="mb-4 block"><span className="mb-1.5 block text-xs font-semibold text-white/55">Légende</span><textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={3} placeholder="Ce que tu veux partager..." className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm outline-none focus:border-pink-500/70" /></label>
        <label className="mb-4 block"><span className="mb-1.5 block text-xs font-semibold text-white/55">Lieu (facultatif)</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Antananarivo" className="w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm outline-none focus:border-pink-500/70" /></label>
        {imageUrl && <img src={imageUrl} alt="Aperçu" className="mb-4 max-h-64 w-full rounded-2xl object-cover" onError={() => setError("Cette image ne peut pas être affichée.")} />}
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 py-3 font-bold disabled:opacity-50">{busy ? "Publication..." : "Publier réellement"}</button>
      </form>
    </div>
  );
}

function ProfilePage({ username, currentUser, onFollow, onOpenProfile }: { username: string; currentUser: User; onFollow: (profile: Profile) => Promise<void>; onOpenProfile: (username: string) => void }) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<ProfileResponse>(`/users/${encodeURIComponent(username)}`).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : "Profil introuvable."));
  }, [username]);
  if (error) return <EmptyState title="Profil indisponible" message={error} />;
  if (!data) return <Loading />;
  const profile = data.user;
  return (
    <section className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[.045] p-5">
        <Avatar user={profile} size="lg" />
        <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{profile.displayName}</h2><p className="text-sm text-white/45">@{profile.username}</p><p className="mt-2 text-sm text-white/70">{profile.bio || "Aucune bio pour le moment."}</p></div>
        {profile.id !== currentUser.id && <button onClick={() => { void onFollow(profile).then(() => setData({ ...data, user: { ...profile, isFollowing: !profile.isFollowing, followers: profile.followers + (profile.isFollowing ? -1 : 1) } })); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ${profile.isFollowing ? "bg-white/10 text-white" : "bg-gradient-to-r from-pink-500 to-violet-600"}`}>{profile.isFollowing ? "Abonné" : "Suivre"}</button>}
      </div>
      <div className="mt-4 grid grid-cols-3 rounded-2xl border border-white/10 bg-white/[.03] py-3 text-center text-sm"><span><b className="block text-lg">{profile.posts}</b>publications</span><span><b className="block text-lg">{profile.followers}</b>abonnés</span><span><b className="block text-lg">{profile.following}</b>abonnements</span></div>
      <div className="mt-5 grid grid-cols-3 gap-1.5">{data.posts.map((post) => <button key={post.id} onClick={() => onOpenProfile(profile.username)} className="group aspect-square overflow-hidden bg-white/5"><img src={post.imageUrl} alt={post.caption || "Publication"} className="h-full w-full object-cover transition group-hover:scale-105" /></button>)}</div>
      {!data.posts.length && <EmptyState title="Aucune publication" message="Les publications de ce profil apparaîtront ici." />}
    </section>
  );
}

function SearchPage({ onOpenProfile }: { onOpenProfile: (username: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = window.setTimeout(() => { request<{ users: User[] }>(`/users/search?q=${encodeURIComponent(query)}`).then((result) => setResults(result.users)).catch(() => setResults([])); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  return <section className="mx-auto max-w-2xl px-4 py-6"><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.05] px-4 py-3"><Search size={18} className="text-white/40" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un profil..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><div className="mt-4 space-y-2">{results.map((user) => <button key={user.id} onClick={() => onOpenProfile(user.username)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left"><Avatar user={user} size="sm" /><span><b className="block text-sm">{user.displayName}</b><small className="text-white/45">@{user.username}</small></span></button>)}</div>{query && !results.length && <EmptyState title="Aucun résultat" message="Essaie un autre nom ou identifiant." />}</section>;
}

function Loading() {
  return <div className="flex items-center justify-center py-20 text-white/50"><RefreshCw className="mr-2 animate-spin" size={18} />Chargement...</div>;
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="py-20 text-center"><Users className="mx-auto text-white/25" size={34} /><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-white/45">{message}</p></div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>("feed");
  const [profileUsername, setProfileUsername] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function loadFeed() {
    setLoading(true);
    setError("");
    try {
      const result = await request<{ posts: Post[] }>("/feed");
      setPosts(result.posts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de charger le feed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setBooting(false); return; }
    request<{ user: User }>("/auth/me").then((result) => setUser(result.user)).catch(() => localStorage.removeItem(TOKEN_KEY)).finally(() => setBooting(false));
  }, []);

  useEffect(() => { if (user && tab === "feed") void loadFeed(); }, [user, tab]);

  const profile = useMemo(() => profileUsername || user?.username || "", [profileUsername, user]);
  function openProfile(username: string) { setProfileUsername(username); setTab("profile"); }
  function logout() { void request("/auth/logout", { method: "POST" }).catch(() => undefined); localStorage.removeItem(TOKEN_KEY); setUser(null); }

  async function toggleFollow(profileData: Profile) {
    const result = await request<{ following: boolean }>(`/users/${profileData.id}/follow`, { method: "POST" });
    setProfileUsername(profileData.username);
    window.dispatchEvent(new CustomEvent("yuniko-follow-updated", { detail: result.following }));
  }

  if (booting) return <Loading />;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  return (
    <div className="min-h-screen bg-[#0d0b14] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0d0b14]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <button onClick={() => { setTab("feed"); setProfileUsername(""); }} className="text-2xl font-black tracking-tight"><span className="gradient-text">yuniko</span></button>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-3 py-2 text-sm font-bold"><ImagePlus size={17} className="inline mr-1" />Publier</button>
            <button onClick={() => openProfile(user.username)} className="rounded-xl p-2 text-white/70 hover:bg-white/10"><UserRound size={19} /></button>
            <button onClick={logout} className="rounded-xl p-2 text-white/50 hover:bg-white/10" title="Se déconnecter"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl pb-24">
        {tab === "feed" && <section className="mx-auto max-w-2xl px-4 py-6">{error && <div className="mb-4 flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"><span>{error}</span><button onClick={() => void loadFeed()}><RefreshCw size={16} /></button></div>}<div className="mb-5 flex items-center justify-between"><div><p className="text-sm text-white/45">Ton espace</p><h1 className="text-2xl font-bold">Fil d'actualité</h1></div><button onClick={() => void loadFeed()} className="rounded-xl bg-white/10 p-2 text-white/70" title="Actualiser"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button></div>{loading && !posts.length ? <Loading /> : posts.length ? <div className="space-y-5">{posts.map((post) => <PostCard key={post.id} post={post} onChange={(updated) => setPosts((items) => items.map((item) => item.id === updated.id ? updated : item))} onOpenProfile={openProfile} />)}</div> : <EmptyState title="Ton feed est vide" message="Publie la première photo de ta communauté." />}</section>}
        {tab === "search" && <SearchPage onOpenProfile={openProfile} />}
        {tab === "profile" && <ProfilePage username={profile} currentUser={user} onFollow={(profileData) => toggleFollow(profileData)} onOpenProfile={openProfile} />}
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-white/10 bg-[#0d0b14]/95 pb-safe backdrop-blur-xl"><div className="mx-auto flex max-w-2xl justify-around py-2"><NavButton active={tab === "feed"} onClick={() => { setTab("feed"); setProfileUsername(""); }} icon={<Heart size={21} />} label="Accueil" /><NavButton active={tab === "search"} onClick={() => setTab("search")} icon={<Search size={21} />} label="Explorer" /><NavButton active={tab === "profile"} onClick={() => openProfile(user.username)} icon={<UserRound size={21} />} label="Profil" /></div></nav>
      {showCreate && <CreatePost onClose={() => setShowCreate(false)} onCreated={(post) => setPosts((items) => [post, ...items])} />}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] ${active ? "text-pink-400" : "text-white/45"}`}>{icon}<span>{label}</span></button>;
}