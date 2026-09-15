import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Router, Route, Switch, useLocation, useParams } from "wouter";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  BookmarkIcon,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  Globe,
  Grid3X3,
  Hash,
  Heart,
  Home as HomeIcon,
  Image as ImageIcon,
  Info,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Phone,
  Play,
  Plus,
  Search as SearchIcon,
  Send,
  Settings as SettingsIcon,
  Share2,
  Shield,
  Sparkles,
  User,
  UserPlus,
  Users,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import "./index.css";
import { rankFeedPosts } from "./feedAlgorithm";

const GRADIENT = "linear-gradient(135deg,#FF006E 0%,#8B00FF 100%)";
const IMG = {
  neon: "/scene-neon.jpg",
  roof: "/scene-rooftop.jpg",
  flower: "/scene-flower.jpg",
  dj: "/scene-dj.jpg",
};

type DemoUser = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  verified?: boolean;
};
type DemoPost = {
  id: string;
  user: DemoUser;
  image: string;
  caption: string;
  hashtags: string[];
  likes: number;
  comments: number;
  shares: number;
  views: number;
  location?: string;
};
type DemoStory = { id: string; user: DemoUser; image: string; viewed?: boolean };
type DemoState = {
  liked: string[];
  saved: string[];
  following: string[];
  comments: Record<string, string[]>;
  storyReplies: Record<string, string[]>;
  messages: Record<string, string[]>;
  archived: string[];
  blocked: string[];
  privateProfile: boolean;
  messageRequests: boolean;
  twoFactor: boolean;
  loginAlerts: boolean;
  notifications: boolean;
  accountEmail: string;
  profile: Pick<DemoUser, "displayName" | "username" | "bio" | "avatar">;
  posts: DemoPost[];
  stories: DemoStory[];
};

const currentUser: DemoUser = {
  id: "me",
  username: "maya.chen",
  displayName: "Maya Chen",
  avatar: IMG.neon,
  bio: "Collecting little sparks from everywhere.",
  followers: 1248,
  following: 384,
  posts: 87,
  verified: true,
};
const people: DemoUser[] = [
  currentUser,
  { id: "1", username: "sofia.park", displayName: "Sofia Park", avatar: IMG.roof, bio: "Light leaks and late trains.", followers: 4820, following: 612, posts: 132 },
  { id: "2", username: "noah.reyes", displayName: "Noah Reyes", avatar: IMG.dj, bio: "Sound, motion, after dark.", followers: 905, following: 202, posts: 64, verified: true },
  { id: "3", username: "lina.rose", displayName: "Lina Rose", avatar: IMG.flower, bio: "A soft spot for strange flowers.", followers: 3204, following: 244, posts: 210 },
];
const basePosts: DemoPost[] = [
  { id: "p1", user: people[1], image: IMG.roof, caption: "Found a little more color on the way home.", hashtags: ["#nightwalk", "#citylight"], likes: 1247, comments: 38, shares: 17, views: 8400, location: "Seoul, South Korea" },
  { id: "p2", user: people[2], image: IMG.dj, caption: "The room changes when the bass comes in.", hashtags: ["#afterdark", "#soundcheck"], likes: 892, comments: 24, shares: 12, views: 5200 },
  { id: "p3", user: people[3], image: IMG.flower, caption: "Tiny worlds hiding in plain sight.", hashtags: ["#softfocus"], likes: 634, comments: 19, shares: 8, views: 3100, location: "Lisbon, Portugal" },
];
const baseStories: DemoStory[] = [
  { id: "s1", user: people[1], image: IMG.roof },
  { id: "s2", user: people[2], image: IMG.dj },
  { id: "s3", user: people[3], image: IMG.flower, viewed: true },
];

const defaultState: DemoState = {
  liked: [],
  saved: [],
  following: [],
  comments: { p1: ["Love the colors in this one.", "This feels like a whole movie."], p2: ["The energy is perfect."], p3: [] },
  storyReplies: {},
  messages: { "1": ["That light is unreal.", "I know, right? It felt like the whole street was glowing."], "2": ["See you after soundcheck."], "3": ["Sent a photo"] },
  archived: [],
  blocked: [],
  privateProfile: false,
  messageRequests: true,
  twoFactor: false,
  loginAlerts: true,
  notifications: true,
  accountEmail: "maya.chen@example.com",
  profile: { displayName: currentUser.displayName, username: currentUser.username, bio: currentUser.bio, avatar: currentUser.avatar },
  posts: basePosts,
  stories: baseStories,
};

type StoreContextValue = {
  state: DemoState;
  activeUser: DemoUser;
  getUser: (id?: string) => DemoUser;
  toast: string | null;
  showToast: (message: string) => void;
  toggleLike: (postId: string) => void;
  toggleSave: (postId: string) => void;
  toggleFollow: (userId: string) => void;
  addComment: (postId: string, comment: string) => void;
  addStoryReply: (storyId: string, reply: string) => void;
  sendMessage: (userId: string, message: string) => void;
  archiveConversation: (userId: string) => void;
  addPost: (input: { caption: string; image?: string; location?: string; hashtags?: string[] }) => void;
  addStory: (input: { caption: string; image?: string }) => void;
  updateProfile: (profile: Partial<DemoState["profile"]>) => void;
  updateState: (patch: Partial<DemoState>) => void;
  toggleBlocked: (userId: string) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);
function loadState(): DemoState {
  try {
    const saved = localStorage.getItem("yuniko-demo-state");
    if (!saved) return defaultState;
    const parsed = JSON.parse(saved);
    delete parsed.theme;
    return { ...defaultState, ...parsed, profile: { ...defaultState.profile, ...parsed.profile } };
  } catch {
    return defaultState;
  }
}
function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(loadState);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const activeUser = useMemo(() => ({ ...currentUser, ...state.profile }), [state.profile]);
  useEffect(() => { localStorage.setItem("yuniko-demo-state", JSON.stringify(state)); }, [state]);
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);
  const toggleArrayValue = useCallback((key: "liked" | "saved" | "following", value: string) => {
    setState((previous) => ({ ...previous, [key]: previous[key].includes(value) ? previous[key].filter((item) => item !== value) : [...previous[key], value] }));
  }, []);
  const addPost = useCallback((input: { caption: string; image?: string; location?: string; hashtags?: string[] }) => {
    setState((previous) => ({ ...previous, posts: [{ id: `p-${Date.now()}`, user: { ...activeUser, posts: activeUser.posts + 1 }, image: input.image || IMG.neon, caption: input.caption || "A little spark from today.", hashtags: input.hashtags || [], likes: 0, comments: 0, shares: 0, views: 0, location: input.location || undefined }, ...previous.posts] }));
    showToast("Post published");
  }, [activeUser, showToast]);
  const addStory = useCallback((input: { caption: string; image?: string }) => {
    setState((previous) => ({ ...previous, stories: [{ id: `s-${Date.now()}`, user: activeUser, image: input.image || IMG.neon }, ...previous.stories] }));
    showToast("Story shared");
  }, [activeUser, showToast]);
  const value: StoreContextValue = {
    state,
    activeUser,
    getUser: (id) => id === "me" || !id ? activeUser : people.find((person) => person.id === id) ?? people[1],
    toast,
    showToast,
    toggleLike: (id) => toggleArrayValue("liked", id),
    toggleSave: (id) => toggleArrayValue("saved", id),
    toggleFollow: (id) => toggleArrayValue("following", id),
    addComment: (id, comment) => setState((previous) => ({ ...previous, comments: { ...previous.comments, [id]: [...(previous.comments[id] || []), comment] } })),
    addStoryReply: (id, reply) => setState((previous) => ({ ...previous, storyReplies: { ...previous.storyReplies, [id]: [...(previous.storyReplies[id] || []), reply] } })),
    sendMessage: (id, message) => setState((previous) => ({ ...previous, messages: { ...previous.messages, [id]: [...(previous.messages[id] || []), message] } })),
    archiveConversation: (id) => setState((previous) => ({ ...previous, archived: previous.archived.includes(id) ? previous.archived.filter((item) => item !== id) : [...previous.archived, id] })),
    addPost,
    addStory,
    updateProfile: (profile) => setState((previous) => ({ ...previous, profile: { ...previous.profile, ...profile } })),
    updateState: (patch) => setState((previous) => ({ ...previous, ...patch })),
    toggleBlocked: (id) => setState((previous) => ({ ...previous, blocked: previous.blocked.includes(id) ? previous.blocked.filter((item) => item !== id) : [...previous.blocked, id] })),
  };
  return <StoreContext.Provider value={value}>{children}<ToastHost /></StoreContext.Provider>;
}
function useDemo() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useDemo must be used inside StoreProvider");
  return value;
}
function ToastHost() {
  const { toast } = useDemo();
  return <AnimatePresence>{toast && <motion.div initial={{ opacity: 0, y: 20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] rounded-full bg-white text-[#170f21] px-5 py-3 text-sm font-semibold shadow-2xl whitespace-nowrap">{toast}</motion.div>}</AnimatePresence>;
}

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function Avatar({ user, size = "md", ring = false }: { user: DemoUser; size?: "sm" | "md" | "lg"; ring?: boolean }) {
  const sizes = { sm: "w-8 h-8", md: "w-11 h-11", lg: "w-20 h-20" };
  return <div className={`${sizes[size]} rounded-full p-[2px] shrink-0`} style={ring ? { background: GRADIENT } : undefined}><div className="w-full h-full rounded-full overflow-hidden bg-white/10">{user.avatar ? <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-white/80 font-bold">{initials(user.displayName)}</span>}</div></div>;
}
function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onDone, 1750); return () => window.clearTimeout(timer); }, [onDone]);
  return <motion.div className="fixed inset-0 z-[999] flex flex-col items-center justify-center gradient-bg" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .35 }}><motion.div initial={{ scale: .7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .55, ease: [0.34, 1.56, 0.64, 1] }} className="flex flex-col items-center gap-4"><div className="w-28 h-28 rounded-3xl bg-white/15 flex items-center justify-center shadow-2xl"><Sparkles size={50} className="text-white" strokeWidth={1.6} /></div><motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .22 }} className="text-white text-4xl font-black tracking-tight">Yuniko</motion.span><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .48 }} className="mt-10 flex flex-col items-center gap-1"><span className="text-white/90 text-sm font-semibold tracking-wide">Aora Group</span><div className="flex gap-1.5 mt-3">{[0, 1, 2].map((i) => <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-white/75" animate={{ scale: [1, 1.4, 1], opacity: [.7, 1, .7] }} transition={{ repeat: Infinity, duration: .9, delay: i * .18 }} />)}</div></motion.div></motion.div></motion.div>;
}

function BottomNav() {
  const [location, navigate] = useLocation();
  const items = [{ path: "/", label: "Home", icon: HomeIcon }, { path: "/notifications", label: "Alerts", icon: Bell }, { path: "/messages", label: "Messages", icon: MessageCircle }, { path: "/profile", label: "Profile", icon: User }];
  const active = (path: string) => path === "/" ? location === "/" : location.startsWith(path);
  return <nav className="fixed bottom-0 left-0 right-0 z-50 yuniko-bottom-nav glass border-t border-pink-400/15"><div className="flex items-center justify-around h-16 max-w-[1120px] mx-auto px-2">{items.slice(0, 2).map(({ path, label, icon: Icon }) => <NavButton key={path} path={path} label={label} icon={Icon} active={active(path)} navigate={navigate} />)}<motion.button aria-label="Create" onClick={() => navigate("/create")} whileTap={{ scale: .88 }} className="w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: GRADIENT, boxShadow: "0 0 24px rgba(255,0,110,.45)" }}><Plus size={25} className="text-white" strokeWidth={2.8} /></motion.button>{items.slice(2).map(({ path, label, icon: Icon }) => <NavButton key={path} path={path} label={label} icon={Icon} active={active(path)} navigate={navigate} />)}</div></nav>;
}
function NavButton({ path, label, icon: Icon, active, navigate }: { path: string; label: string; icon: typeof HomeIcon; active: boolean; navigate: (path: string) => void }) {
  return <button aria-label={label} onClick={() => navigate(path)} className="w-14 h-14 flex flex-col items-center justify-center gap-0.5 relative"><Icon size={22} style={{ color: active ? "#FF3D9A" : "rgba(255,255,255,.45)" }} strokeWidth={active ? 2.3 : 1.7} /><span className="text-[10px]" style={{ color: active ? "#FF3D9A" : "rgba(255,255,255,.38)" }}>{label}</span><span className="absolute bottom-0 w-1 h-1 rounded-full bg-pink-400" style={{ opacity: active ? 1 : 0 }} /></button>;
}
function PageShell({ children, nav = true, className = "" }: { children: ReactNode; nav?: boolean; className?: string }) {
  return <div className={`w-full min-h-screen bg-[#0d0b14] text-white ${nav ? "pb-20" : ""} ${className}`}>{children}{nav && <BottomNav />}</div>;
}
function TopBar({ title, back = true, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const [, navigate] = useLocation();
  return <header className="sticky top-0 z-40 px-4 py-4 flex items-center gap-3 glass border-b border-white/[.06]">{back && <button aria-label="Back" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")}><ArrowLeft size={22} className="text-white/80" /></button>}<h1 className="text-base font-semibold flex-1">{title}</h1>{action}</header>;
}
function StoryStrip() {
  const [, navigate] = useLocation();
  const { state, activeUser } = useDemo();
  return <div className="absolute inset-x-0 z-40 h-[78px] top-14 glass border-b border-white/5"><div className="flex items-center gap-3 h-full px-3 overflow-x-auto no-scrollbar"><motion.button whileTap={{ scale: .9 }} onClick={() => navigate("/create?mode=story")} className="flex flex-col items-center gap-1 min-w-16"><div className="relative w-[54px] h-[54px] rounded-full p-[2px] border-2 border-dashed border-pink-400/50"><Avatar user={activeUser} size="md" /><span className="absolute bottom-0 right-0 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#0d0b14]" style={{ background: GRADIENT }}><Plus size={9} /></span></div><span className="text-white/65 text-[10px]">Your story</span></motion.button>{state.stories.map((story) => <motion.button key={story.id} whileTap={{ scale: .9 }} onClick={() => navigate(`/story/${story.id}`)} className="flex flex-col items-center gap-1 min-w-16"><div className="w-[54px] h-[54px] rounded-full p-[2px]" style={{ background: story.viewed ? "rgba(255,255,255,.14)" : GRADIENT }}><div className="w-full h-full rounded-full overflow-hidden border-2 border-[#0d0b14]"><img src={story.user.avatar} alt={story.user.displayName} className="w-full h-full object-cover" /></div></div><span className="text-white/65 text-[10px] truncate max-w-[60px]">{story.user.displayName.split(" ")[0]}</span></motion.button>)}</div></div>;
}

function PostCard({ post }: { post: DemoPost }) {
  const [, navigate] = useLocation();
  const { state, toggleLike, toggleSave, addComment, toggleFollow, showToast } = useDemo();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  const liked = state.liked.includes(post.id);
  const saved = state.saved.includes(post.id);
  const following = state.following.includes(post.user.id);
  const postComments = state.comments[post.id] || [];
  const tapImage = () => { const now = Date.now(); if (now - lastTap.current < 320) { if (!liked) toggleLike(post.id); setBurst(true); window.setTimeout(() => setBurst(false), 700); } lastTap.current = now; };
  const share = async () => { const url = `${window.location.origin}/post/${post.id}`; try { if (navigator.share) await navigator.share({ title: "Yuniko post", url }); else await navigator.clipboard?.writeText(url); showToast("Post link copied"); } catch { showToast("Sharing cancelled"); } };
  const submitComment = (event: FormEvent) => { event.preventDefault(); if (!comment.trim()) return; addComment(post.id, comment.trim()); setComment(""); showToast("Comment added"); };
  return <div className="relative w-full h-full"><img src={post.image} alt={post.caption} className="absolute inset-0 w-full h-full object-cover cursor-pointer" onClick={tapImage} /><div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.22) 50%,transparent 72%)" }} /><div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-black/40 backdrop-blur-md"><Eye size={12} className="text-white/75" /><span className="text-white/80 text-[11px] font-semibold">{post.views.toLocaleString()}</span></div><motion.button whileTap={{ scale: .88 }} aria-label="Open post" onClick={() => navigate(`/post/${post.id}`)} className="absolute top-3 right-3 p-2 rounded-full bg-black/35 backdrop-blur-md"><MoreHorizontal size={18} /></motion.button><AnimatePresence>{burst && <motion.div initial={{ scale: .4, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: .65 }} className="absolute inset-0 flex items-center justify-center pointer-events-none"><Heart size={100} className="fill-red-500 text-red-500" /></motion.div>}</AnimatePresence><div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-10"><ActionButton label={String(post.likes + (liked ? 1 : 0))} onClick={() => toggleLike(post.id)}><Heart size={25} className={liked ? "fill-red-500 text-red-500" : "text-white"} strokeWidth={1.8} /></ActionButton><ActionButton label={String(postComments.length)} onClick={() => setCommentsOpen(true)}><MessageCircle size={25} strokeWidth={1.8} /></ActionButton><ActionButton label={String(post.shares)} onClick={share}><Share2 size={25} strokeWidth={1.8} /></ActionButton><ActionButton label={saved ? "Saved" : "Save"} onClick={() => { toggleSave(post.id); showToast(saved ? "Removed from saved" : "Saved for later"); }}><Bookmark size={25} className={saved ? "fill-yellow-400 text-yellow-400" : ""} strokeWidth={1.8} /></ActionButton></div><div className="absolute bottom-4 left-3 right-20 z-10"><div className="flex items-center gap-2.5 mb-1.5"><button onClick={() => navigate(`/user/${post.user.id}`)}><Avatar user={post.user} size="sm" ring /></button><div className="flex-1 min-w-0"><button onClick={() => navigate(`/user/${post.user.id}`)} className="font-semibold text-sm">{post.user.displayName}</button><p className="text-white/55 text-xs">{post.location ?? "World Feed"}</p></div>{post.user.id !== "me" && <button onClick={() => { toggleFollow(post.user.id); showToast(following ? `Unfollowed ${post.user.displayName}` : `Following ${post.user.displayName}`); }} className="px-3.5 py-1 rounded-full text-xs font-semibold bg-white/15 border border-white/15">{following ? "Following" : "Follow"}</button>}</div><p className="text-white text-sm font-medium leading-snug line-clamp-2">{post.caption}</p><p className="text-pink-300 text-sm mt-0.5">{post.hashtags.join(" ")}</p><p className="text-white/40 text-xs mt-0.5">2h ago</p></div><AnimatePresence>{commentsOpen && <><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60" onClick={() => setCommentsOpen(false)} /><motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 340 }} className="fixed bottom-0 left-0 right-0 mx-auto z-[61] max-w-[1100px] rounded-t-3xl flex flex-col" style={{ maxHeight: "72vh", background: "rgba(14,11,24,.98)", border: "1px solid rgba(255,255,255,.09)" }}><div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3" /><div className="flex items-center justify-between px-5 py-4 border-b border-white/10"><span className="font-semibold text-sm">Comments ({postComments.length})</span><button onClick={() => setCommentsOpen(false)}><X size={18} className="text-white/60" /></button></div><div className="flex-1 overflow-y-auto p-5">{postComments.length === 0 ? <p className="text-white/40 text-sm text-center py-8">Be the first to comment.</p> : postComments.map((item, index) => <div key={`${item}-${index}`} className="flex gap-3 mb-5"><Avatar user={people[index % people.length]} size="sm" /><p className="text-white/80 text-sm">{item}</p></div>)}</div><form className="flex items-center gap-3 p-4 border-t border-white/10 pb-safe" onSubmit={submitComment}><input aria-label="Add a comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" className="flex-1 bg-white/[.06] border border-white/10 rounded-full px-4 py-2.5 text-sm outline-none placeholder:text-white/35" /><button aria-label="Send comment" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: comment.trim() ? GRADIENT : "rgba(255,255,255,.08)" }}><Send size={15} /></button></form></motion.div></>}</AnimatePresence></div>;
}
function ActionButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) { return <motion.button whileTap={{ scale: .85 }} onClick={onClick} className="flex flex-col items-center gap-0.5"><span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center">{children}</span><span className="text-white text-[11px] font-medium">{label}</span></motion.button>; }

function Home() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [worldMenu, setWorldMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [feedCycle, setFeedCycle] = useState(0);

  useEffect(() => {
    setFeedCycle((cycle) => cycle + 1);
  }, []);

  const rankedPosts = useMemo(() => {
    const historyKey = "yuniko-feed-history";
    let recentlySeenPostIds: string[] = [];
    try {
      recentlySeenPostIds = JSON.parse(localStorage.getItem(historyKey) || "[]");
    } catch {
      recentlySeenPostIds = [];
    }

    const recentlySeenUserIds = state.posts
      .filter((post) => recentlySeenPostIds.includes(post.id))
      .map((post) => post.user.id);

    const followedUserIds = state.following;
    const interests: Record<string, number> = {};
    state.posts.forEach((post) => {
      post.hashtags.forEach((tag) => {
        const key = tag.replace(/^#/, "").toLowerCase();
        interests[key] = Math.max(interests[key] || 0, followedUserIds.includes(post.user.id) ? 1 : 0.25);
      });
    });

    const ranked = rankFeedPosts(
      state.posts.map((post, index) => ({
        id: post.id,
        userId: post.user.id,
        hashtags: post.hashtags,
        likes: post.likes + (state.liked.includes(post.id) ? 1 : 0),
        comments: Math.max(post.comments, state.comments[post.id]?.length || 0),
        shares: post.shares,
        saves: state.saved.includes(post.id) ? 1 : 0,
        views: post.views,
        createdAt: post.id.startsWith("p-") ? Number(post.id.slice(2)) || Date.now() : Date.now() - index * 2 * 60 * 60 * 1000,
      })),
      {
        followedUserIds,
        interests,
        recentlySeenPostIds,
        recentlySeenUserIds,
        notInterestedPostIds: [],
        notInterestedUserIds: state.blocked,
      },
      { maxPostsPerUser: 2 },
    );

    const ordered = ranked
      .map((rankedPost) => state.posts.find((post) => post.id === rankedPost.id))
      .filter(Boolean) as typeof state.posts;

    if (ordered.length) {
      const nextHistory = [...new Set([...ordered.slice(0, 4).map((post) => post.id), ...recentlySeenPostIds])].slice(0, 12);
      try {
        localStorage.setItem(historyKey, JSON.stringify(nextHistory));
      } catch {
        // Ignore storage failures; the feed still works in memory.
      }
    }

    return ordered;
  }, [state.posts, state.following, state.liked, state.saved, state.comments, state.blocked, feedCycle]);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
  return <PageShell><div className="relative w-full min-h-screen bg-[#0d0b14] overflow-hidden"><header className="absolute inset-x-0 top-0 z-50 h-14 flex items-center justify-between gap-2 px-3 min-[360px]:px-4 glass border-b border-pink-400/10"><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-2xl font-black gradient-text">Yuniko</button><button onClick={() => setWorldMenu(!worldMenu)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[.06] border border-pink-400/30 text-white/90 text-xs min-[360px]:text-sm"><Globe size={12} />World Feed<ChevronDown size={11} /></button><div className="flex items-center gap-3"><button aria-label="Search" onClick={() => navigate("/search")}><SearchIcon size={20} className="text-white/75" /></button><button aria-label="Add friends" onClick={() => navigate("/add-friends")}><UserPlus size={20} className="text-white/75" /></button></div></header><StoryStrip />{worldMenu && <><button className="fixed inset-0 z-40 cursor-default" onClick={() => setWorldMenu(false)} aria-label="Close menu" /><motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="absolute top-[60px] left-1/2 -translate-x-1/2 w-44 rounded-2xl z-50 overflow-hidden bg-[#120e1e] border border-pink-400/25"><button onClick={() => setWorldMenu(false)} className="w-full px-4 py-3 text-left text-sm flex items-center gap-2"><Globe size={13} />World Feed</button><button onClick={() => { setWorldMenu(false); navigate("/search?tag=nightwalk"); }} className="w-full px-4 py-3 text-left text-sm flex items-center gap-2"><Hash size={13} />Trending tags</button></motion.div></>}{!online && <div className="absolute inset-x-0 top-[134px] z-40 flex items-center justify-center gap-1.5 py-1.5 bg-red-500/85"><WifiOff size={12} /><span className="text-xs">Offline mode</span></div>}<div className="absolute inset-x-0 top-[134px] bottom-[64px] overflow-y-scroll snap-y snap-mandatory no-scrollbar" data-testid="posts-feed">{rankedPosts.map((post) => <div key={post.id} className="relative w-full max-w-[920px] mx-auto px-2 py-1 snap-start snap-always" style={{ height: "calc(100dvh - 198px)", minHeight: 480 }}><div className="relative w-full h-full rounded-2xl overflow-hidden"><PostCard post={post} /></div></div>)}</div></div></PageShell>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const submit = (event?: FormEvent) => { event?.preventDefault(); if (!username.trim() || !password) { setError("Please fill in all fields"); return; } onLogin(); navigate("/"); };
  const Field = ({ icon, value, onChange, placeholder, type = "text", suffix }: { icon: ReactNode; value: string; onChange: (value: string) => void; placeholder: string; type?: string; suffix?: ReactNode }) => <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[.06] border border-white/10">{icon}<input type={type} value={value} onChange={(event) => { onChange(event.target.value); setError(""); }} placeholder={placeholder} className="flex-1 bg-transparent text-white/90 text-sm outline-none placeholder:text-white/30" />{suffix}</div>;
  return <PageShell nav={false} className="flex flex-col"><div className="relative flex flex-col items-center justify-end px-6 pt-14 pb-7 min-h-[220px]"><div className="absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(255,0,110,.17),rgba(139,0,255,.13) 60%,transparent)" }} /><div className="relative flex flex-col items-center"><div className="w-[68px] h-[68px] rounded-[20px] flex items-center justify-center mb-3" style={{ background: GRADIENT, boxShadow: "0 0 44px rgba(255,0,110,.45)" }}><Sparkles size={35} /></div><h1 className="text-2xl font-black gradient-text">Yuniko</h1></div></div><div className="flex-1 w-full max-w-lg mx-auto px-6 pb-10"><AnimatePresence mode="wait" initial={false}>{mode === "signin" && <motion.form key="signin" onSubmit={submit} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}><div className="flex p-1 rounded-2xl mb-6 bg-white/[.06] border border-white/10"><button type="button" className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: GRADIENT }}>Sign In</button><button type="button" onClick={() => { setMode("signup"); setError(""); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/50">Sign Up</button></div><div className="flex flex-col gap-3 mb-4"><Field icon={<User size={18} className="text-white/40" />} value={username} onChange={setUsername} placeholder="Username" /><Field icon={<Lock size={18} className="text-white/40" />} value={password} onChange={setPassword} placeholder="Password" type={showPw ? "text" : "password"} suffix={<button type="button" aria-label="Toggle password" onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff size={16} className="text-white/40" /> : <Eye size={16} className="text-white/40" />}</button>} /></div><div className="text-right mb-5"><button type="button" onClick={() => { setMode("forgot"); setError(""); }} className="text-sm text-pink-400">Forgot Password?</button></div>{error && <p className="text-red-400 text-xs text-center mb-4">{error}</p>}<button type="submit" className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: GRADIENT, boxShadow: "0 4px 20px rgba(255,0,110,.35)" }}>Sign In <ArrowRight size={16} /></button><p className="text-center text-white/40 text-sm mt-5">Don't have an account? <button type="button" onClick={() => { setMode("signup"); setError(""); }} className="font-semibold text-pink-400">Sign Up</button></p></motion.form>}{mode === "signup" && <motion.div key={`signup-${step}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}><div className="flex items-center justify-between mb-5"><button onClick={() => step === 1 ? setMode("signin") : setStep(step - 1)}><ArrowLeft size={20} className="text-white/60" /></button><div className="flex gap-1.5">{[1, 2, 3].map((n) => <span key={n} className="h-1.5 rounded-full transition-all" style={{ width: step === n ? 20 : 6, background: n <= step ? GRADIENT : "rgba(255,255,255,.18)" }} />)}</div><span className="w-6" /></div>{step === 1 && <><h2 className="text-xl font-bold mb-1">Create account</h2><p className="text-white/40 text-sm mb-5">Choose a unique username</p><div className="flex flex-col gap-3 mb-5"><Field icon={<span className="text-white/40">@</span>} value={username} onChange={setUsername} placeholder="username" /><Field icon={<Lock size={18} className="text-white/40" />} value={password} onChange={setPassword} placeholder="Password (min 6 characters)" type="password" /><Field icon={<Lock size={18} className="text-white/40" />} value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" type="password" /></div><button onClick={() => { if (username.length < 3 || password.length < 6 || password !== confirmPassword) setError("Use 3+ characters and matching passwords."); else { setError(""); setStep(2); } }} className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: GRADIENT }}>Continue <ArrowRight size={16} /></button></>}{step === 2 && <><h2 className="text-xl font-bold mb-1">About you</h2><p className="text-white/40 text-sm mb-5">Help others find and know you</p><div className="flex flex-col gap-3 mb-5"><Field icon={<User size={18} className="text-white/40" />} value={name} onChange={setName} placeholder="Display name" /><Field icon={<Globe size={18} className="text-white/40" />} value="" onChange={() => undefined} placeholder="Where are you from?" /><Field icon={<Users size={18} className="text-white/40" />} value="" onChange={() => undefined} placeholder="Your age" type="number" /></div><button onClick={() => setStep(3)} className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: GRADIENT }}>Continue <ArrowRight size={16} /></button></>}{step === 3 && <><h2 className="text-xl font-bold mb-1">Add your photo</h2><p className="text-white/40 text-sm mb-6">Help people recognize you</p><div className="flex justify-center mb-5"><div className="w-32 h-32 rounded-full flex items-center justify-center border-2 border-dashed border-white/20 bg-white/[.06]"><Camera size={28} className="text-pink-400" /></div></div><button onClick={() => { onLogin(); navigate("/"); }} className="w-full py-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: GRADIENT }}>Create Account <ArrowRight size={16} /></button><button onClick={() => { onLogin(); navigate("/"); }} className="w-full py-3 text-white/35 text-sm mt-2">Skip for now</button></>}</motion.div>}{mode === "forgot" && <motion.form key="forgot" onSubmit={(event) => { event.preventDefault(); if (!username.trim()) setError("Please enter your username"); else { setError(""); setMode("signin"); } }} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}><button type="button" onClick={() => setMode("signin")} className="mb-5"><ArrowLeft size={20} className="text-white/60" /></button><h2 className="text-xl font-bold mb-1">Reset password</h2><p className="text-white/40 text-sm mb-5">Enter your username to continue</p><Field icon={<User size={18} className="text-white/40" />} value={username} onChange={setUsername} placeholder="Your username" />{error && <p className="text-red-400 text-xs text-center mt-4">{error}</p>}<button type="submit" className="w-full py-4 mt-5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: GRADIENT }}>Continue <ArrowRight size={16} /></button></motion.form>}</AnimatePresence></div></PageShell>;
}

function Notifications() {
  const [, navigate] = useLocation();
  const { state, toggleFollow, showToast } = useDemo();
  return <PageShell><TopBar title="Notifications" back={false} /><div className="px-4 pt-4"><button onClick={() => navigate(`/post/p1`)} className="w-full flex items-center gap-3 py-4 border-b border-white/5 text-left"><Avatar user={people[2]} size="md" ring /><p className="text-sm text-white/80 flex-1"><b>Noah Reyes</b> liked your post <span className="text-white/40">2m</span></p><img src={IMG.flower} alt="" className="w-12 h-12 rounded-lg object-cover" /></button><div className="flex items-center gap-3 py-4 border-b border-white/5"><Avatar user={people[3]} size="md" ring /><p className="text-sm text-white/80 flex-1"><b>Lina Rose</b> started following you <span className="text-white/40">1h</span></p><button onClick={() => { toggleFollow("3"); showToast(state.following.includes("3") ? "Unfollowed Lina Rose" : "Following Lina Rose"); }} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: state.following.includes("3") ? "rgba(255,255,255,.12)" : GRADIENT }}>{state.following.includes("3") ? "Following" : "Follow back"}</button></div><button onClick={() => navigate("/story/s1")} className="w-full flex items-center gap-3 py-4 border-b border-white/5 text-left"><Avatar user={people[1]} size="md" ring /><p className="text-sm text-white/80 flex-1"><b>Sofia Park</b> mentioned you in a story <span className="text-white/40">3h</span></p><Play size={18} className="text-pink-400" /></button></div></PageShell>;
}

function Create() {
  const [, navigate] = useLocation();
  const { activeUser, addPost, addStory, showToast } = useDemo();
  const [tab, setTab] = useState<"post" | "story">(() => new URLSearchParams(window.location.search).get("mode") === "story" ? "story" : "post");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [media, setMedia] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const publish = () => { if (!caption.trim() && !media) { showToast(tab === "story" ? "Add a photo or caption first" : "Add a photo or caption first"); return; } if (tab === "story") addStory({ caption, image: media || undefined }); else addPost({ caption, image: media || undefined, location, hashtags: hashtags.split(/[,\s]+/).map((tag) => tag.trim().replace(/^#?/, "#")).filter((tag) => tag.length > 1) }); setPosted(true); };
  if (posted) return <PageShell nav={false} className="flex flex-col items-center justify-center gap-5 px-6"><motion.div initial={{ scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: GRADIENT }}><Check size={36} /></motion.div><p className="text-white font-semibold text-xl">{tab === "story" ? "Story posted" : "Post published"}</p><button onClick={() => navigate("/")} className="text-pink-400 text-sm">Back to World Feed</button></PageShell>;
  return <PageShell className="max-w-[1100px] mx-auto"><input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setMedia(URL.createObjectURL(file)); }} /><TopBar title={tab === "story" ? "New Story" : "New Post"} action={<button onClick={publish} className="px-4 py-1.5 rounded-full text-sm font-semibold" style={{ background: caption.trim() || media ? GRADIENT : "rgba(255,255,255,.1)", opacity: caption.trim() || media ? 1 : .5 }}>{tab === "story" ? "Share" : "Post"}</button>} /><div className="max-w-xl mx-auto px-4 py-5"><div className="flex p-1 rounded-2xl mb-6 bg-white/[.06] border border-white/10"><button onClick={() => setTab("post")} className="flex-1 py-2.5 rounded-xl text-sm" style={tab === "post" ? { background: GRADIENT } : { color: "rgba(255,255,255,.45)" }}>Post</button><button onClick={() => setTab("story")} className="flex-1 py-2.5 rounded-xl text-sm" style={tab === "story" ? { background: GRADIENT } : { color: "rgba(255,255,255,.45)" }}>Story</button></div><div className="flex gap-3 mb-4"><Avatar user={activeUser} size="md" ring /><textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={4} placeholder={tab === "story" ? "Add a caption (optional)" : "Add a caption"} className="flex-1 bg-transparent text-white/85 text-sm resize-none outline-none placeholder:text-white/30" /></div>{media && <div className="relative rounded-2xl overflow-hidden mb-4"><img src={media} alt="Selected preview" className="w-full max-h-[55vh] object-contain bg-white/5" /><button onClick={() => setMedia(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/65 flex items-center justify-center"><X size={14} /></button></div>}<div className="flex gap-3 mb-6"><button onClick={() => inputRef.current?.click()} className="flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 bg-pink-500/[.08] border border-pink-500/25"><ImageIcon size={24} className="text-pink-400" /><span className="text-white/70 text-xs">{media ? "Change media" : "Add photo or video"}</span></button><button onClick={() => { setTab("post"); showToast("Video picker ready"); inputRef.current?.click(); }} className="flex-1 py-4 rounded-2xl flex flex-col items-center gap-2 bg-violet-500/[.08] border border-violet-500/25"><Video size={24} className="text-violet-300" /><span className="text-white/70 text-xs">Video</span></button></div>{tab === "post" && <div className="rounded-2xl overflow-hidden bg-white/[.04] border border-white/[.07]"><div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[.06]"><MapPin size={18} className="text-pink-400" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add a location" className="flex-1 bg-transparent text-white/80 text-sm outline-none placeholder:text-white/30" /></div><div className="flex items-center gap-3 px-4 py-3.5"><Hash size={18} className="text-blue-400" /><input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="Add hashtags" className="flex-1 bg-transparent text-white/80 text-sm outline-none placeholder:text-white/30" /></div></div>}</div></PageShell>;
}

function Messages() {
  const [, navigate] = useLocation();
  const { state, activeUser, showToast, archiveConversation } = useDemo();
  const [query, setQuery] = useState("");
  const conversations = useMemo(() => people.slice(1).map((user) => ({ user, last: state.messages[user.id]?.at(-1) || "Start a conversation", time: "now", unread: state.messages[user.id]?.length || 0, online: user.id !== "3" })).filter((item) => !state.archived.includes(item.user.id) && item.user.displayName.toLowerCase().includes(query.toLowerCase())), [query, state]);
  return <PageShell><TopBar title="Messages" back={false} action={<button aria-label="New message" onClick={() => navigate("/search")}><MessageSquarePlus size={21} /></button>} /><div className="px-4 py-3"><div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white/[.06] border border-white/[.08]"><SearchIcon size={16} className="text-white/40" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" className="flex-1 bg-transparent text-white/80 text-sm outline-none placeholder:text-white/30" /></div></div><div>{conversations.length === 0 ? <EmptyState icon={<MessageSquarePlus size={28} />} title="No messages yet" body="Search for someone to start a conversation." action={<button onClick={() => navigate("/search")} className="mt-5 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: GRADIENT }}>Find people</button>} /> : conversations.map((item) => <div key={item.user.id} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/[.05]"><button onClick={() => navigate(`/chat/${item.user.id}`)} className="flex flex-1 min-w-0 items-center gap-3 text-left"><div className="relative"><Avatar user={item.user} size="md" />{item.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-[#0d0b14]" />}</div><div className="flex-1 min-w-0"><div className="flex justify-between"><span className="font-semibold text-sm">{item.user.displayName}</span><span className="text-xs text-pink-400">{item.time}</span></div><p className="text-sm truncate text-white/55">{item.last}</p></div></button><button onClick={() => { archiveConversation(item.user.id); showToast(`${item.user.displayName} archived`); }} aria-label="Archive conversation" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center"><Archive size={16} className="text-white/50" /></button></div>)}</div><div className="px-4 py-5 text-center text-white/30 text-xs">Signed in as @{activeUser.username}</div></PageShell>;
}
function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center py-24 px-6 text-center"><div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-pink-500/10 border border-pink-500/20 text-pink-400">{icon}</div><h2 className="font-bold text-lg mb-2">{title}</h2><p className="text-white/45 text-sm">{body}</p>{action}</div>; }

function Profile({ userId }: { userId?: string }) {
  const [, navigate] = useLocation();
  const { state, activeUser, getUser, toggleFollow, showToast } = useDemo();
  const user = getUser(userId);
  const [tab, setTab] = useState<"grid" | "saved">("grid");
  const following = state.following.includes(user.id);
  const visiblePosts = tab === "saved" ? state.posts.filter((post) => state.saved.includes(post.id)) : state.posts.filter((post) => post.user.id === user.id || user.id === "me");
  return <PageShell><TopBar title={`@${user.username}`} action={user.id === "me" ? <button aria-label="Settings" onClick={() => navigate("/settings")}><SettingsIcon size={22} className="text-white/80" /></button> : <button aria-label="More" onClick={() => showToast("Profile options opened")}><MoreHorizontal size={22} className="text-white/80" /></button>} /><div className="h-32" style={{ background: GRADIENT }} /><div className="px-4 relative"><div className="flex items-end justify-between -mt-9 mb-3"><Avatar user={user} size="lg" ring />{user.id !== "me" && <div className="flex gap-2"><button onClick={() => { toggleFollow(user.id); showToast(following ? `Unfollowed ${user.displayName}` : `Following ${user.displayName}`); }} className="px-5 py-2 rounded-xl text-sm font-semibold" style={{ background: following ? "rgba(255,255,255,.1)" : GRADIENT }}>{following ? "Following" : "Follow"}</button><button aria-label="Message" onClick={() => navigate(`/chat/${user.id}`)} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><MessageCircle size={16} /></button><button aria-label="Call" onClick={() => navigate(`/call/${user.id}/voice`)} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Phone size={16} /></button></div>}</div><div className="mb-4"><div className="flex items-center gap-1"><h2 className="font-bold text-base">{user.displayName}</h2>{user.verified && <Check size={14} className="text-blue-400" />}</div><p className="text-white/50 text-sm">@{user.username}</p><p className="text-white/80 text-sm mt-2">{user.bio}</p><p className="text-white/45 text-xs mt-2"><MapPin size={12} className="inline" /> World, always</p></div><div className="flex rounded-2xl mb-4 overflow-hidden bg-white/[.04] border border-white/[.07]"><Stat label="Posts" value={user.id === activeUser.id ? state.posts.filter((post) => post.user.id === "me").length || user.posts : user.posts} /><button onClick={() => navigate(`/followers/${user.id}`)} className="flex-1 py-3 border-r border-white/[.07]"><b className="block">{user.followers}</b><span className="text-white/45 text-xs">Followers</span></button><button onClick={() => navigate(`/following/${user.id}`)} className="flex-1 py-3"><b className="block">{user.following}</b><span className="text-white/45 text-xs">Following</span></button></div><div className="flex border-b border-white/5 mb-2"><button aria-label="Posts" onClick={() => setTab("grid")} className={`flex-1 py-3 ${tab === "grid" ? "text-pink-400" : "text-white/40"}`}><Grid3X3 size={18} className="mx-auto" /></button><button aria-label="Saved" onClick={() => setTab("saved")} className={`flex-1 py-3 ${tab === "saved" ? "text-pink-400" : "text-white/40"}`}><BookmarkIcon size={18} className="mx-auto" /></button></div>{visiblePosts.length === 0 ? <EmptyState icon={<BookmarkIcon size={24} />} title="Nothing here yet" body="Saved posts will appear here." /> : <div className="grid grid-cols-3 gap-1">{visiblePosts.map((post) => <button key={post.id} onClick={() => navigate(`/post/${post.id}`)} className="aspect-square bg-white/5 overflow-hidden"><img src={post.image} alt={post.caption} className="w-full h-full object-cover" /></button>)}</div>}</div></PageShell>;
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="flex-1 py-3 text-center border-r border-white/[.07]"><b className="block">{value}</b><span className="text-white/45 text-xs">{label}</span></div>; }

function SearchPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("tag") || "");
  const result = people.filter((person) => `${person.displayName} ${person.username}`.toLowerCase().includes(query.toLowerCase()));
  const matchingPosts = basePosts.filter((post) => post.hashtags.some((tag) => tag.toLowerCase().includes(query.toLowerCase())));
  return <PageShell><TopBar title="Search" /><div className="px-4 py-3"><div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white/[.06] border border-white/[.08]"><SearchIcon size={16} className="text-white/40" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people and tags" className="flex-1 bg-transparent text-white/80 text-sm outline-none placeholder:text-white/30" /></div></div>{result.length > 0 && <div className="px-4"><p className="text-white/40 text-xs uppercase tracking-wider mb-3">People</p>{result.map((person) => <button key={person.id} onClick={() => navigate(`/user/${person.id}`)} className="w-full flex items-center gap-3 py-3 text-left"><Avatar user={person} size="md" ring /><div><p className="font-semibold text-sm">{person.displayName}</p><p className="text-white/45 text-xs">@{person.username}</p></div><ChevronRight size={16} className="ml-auto text-white/25" /></button>)}</div>}{matchingPosts.length > 0 && <div className="px-4 mt-5"><p className="text-white/40 text-xs uppercase tracking-wider mb-3">Posts and tags</p><div className="grid grid-cols-3 gap-1">{matchingPosts.map((post) => <button key={post.id} onClick={() => navigate(`/post/${post.id}`)} className="aspect-square overflow-hidden rounded-lg"><img src={post.image} alt={post.caption} className="w-full h-full object-cover" /></button>)}</div></div>}{query && result.length === 0 && matchingPosts.length === 0 && <EmptyState icon={<SearchIcon size={28} />} title="No results" body={`Nothing matched “${query}”.`} />}</PageShell>;
}

function StoryPage() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { state, addStoryReply, showToast } = useDemo();
  const storyIndex = Math.max(0, state.stories.findIndex((item) => item.id === params.id));
  const story = state.stories[storyIndex] ?? state.stories[0];
  const [reply, setReply] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (!reply.trim()) return; addStoryReply(story.id, reply.trim()); setReply(""); showToast("Reply sent"); };
  const changeStory = (direction: number) => { const next = state.stories[(storyIndex + direction + state.stories.length) % state.stories.length]; navigate(`/story/${next.id}`); };
  return <PageShell nav={false} className="bg-black flex flex-col"><div className="relative flex-1 min-h-[100dvh] overflow-hidden"><img src={story.image} alt={story.user.displayName} className="absolute inset-0 w-full h-full object-cover" /><div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/50" /><button aria-label="Previous story" onClick={() => changeStory(-1)} className="absolute inset-y-24 left-0 w-1/3 z-10" /><button aria-label="Next story" onClick={() => changeStory(1)} className="absolute inset-y-24 right-0 w-1/3 z-10" /><div className="absolute top-3 inset-x-0 px-4 pt-safe"><div className="h-1 rounded-full bg-white/25 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5 }} onAnimationComplete={() => changeStory(1)} className="h-full bg-white" /></div><div className="flex items-center gap-3 mt-4"><Avatar user={story.user} size="sm" ring /><div className="flex-1"><p className="font-semibold text-sm">{story.user.displayName}</p><p className="text-white/60 text-xs">2h ago</p></div><button aria-label="Close story" onClick={() => navigate("/")}><X size={22} /></button></div></div><div className="absolute bottom-10 inset-x-0 text-center px-8"><p className="text-2xl font-black">Find your way into the night.</p><form onSubmit={submit} className="flex items-center gap-2 mt-6"><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to story" className="flex-1 bg-black/35 border border-white/20 rounded-full px-4 py-3 text-sm outline-none placeholder:text-white/60" /><button aria-label="Send story reply" className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: GRADIENT }}><Send size={17} /></button></form></div></div></PageShell>;
}

function Chat() {
  const [, navigate] = useLocation();
  const params = useParams<{ userId?: string }>();
  const contact = people.find((person) => person.id === params.userId) ?? people[1];
  const { state, sendMessage, showToast } = useDemo();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<HTMLInputElement | null>(null);
  const messages = state.messages[contact.id] || [];
  const submit = (event: FormEvent) => { event.preventDefault(); if (text.trim()) { sendMessage(contact.id, text.trim()); setText(""); } };
  return <PageShell nav={false} className="flex flex-col h-[100dvh]"><TopBar title={contact.displayName} action={<div className="flex gap-3"><button aria-label="Voice call" onClick={() => navigate(`/call/${contact.id}/voice`)}><Phone size={19} /></button><button aria-label="Video call" onClick={() => navigate(`/call/${contact.id}/video`)}><Video size={19} /></button></div>} /><div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">{messages.map((message, index) => <div key={`${message}-${index}`} className={`flex ${index % 2 ? "justify-end" : "justify-start"}`}><p className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm ${index % 2 ? "rounded-br-md text-white" : "rounded-bl-md bg-white/[.08] text-white/80"}`} style={index % 2 ? { background: GRADIENT } : undefined}>{message}</p></div>)}</div><form onSubmit={submit} className="flex gap-2 items-center p-3 border-t border-white/10 glass pb-safe"><input ref={setAttachment} type="file" accept="image/*" className="hidden" onChange={(event) => { if (event.target.files?.[0]) { sendMessage(contact.id, "[Photo attached]"); showToast("Photo attached"); } }} /><button type="button" aria-label="Attach" onClick={() => attachment?.click()}><Paperclip size={20} className="text-white/50" /></button><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message" className="flex-1 bg-white/[.06] rounded-full px-4 py-3 text-sm outline-none placeholder:text-white/35" /><button aria-label="Send" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: text.trim() ? GRADIENT : "rgba(255,255,255,.08)" }}><Send size={16} /></button></form></PageShell>;
}

function CallPage() {
  const params = useParams<{ userId?: string; kind?: string }>();
  const [, navigate] = useLocation();
  const contact = people.find((person) => person.id === params.userId) ?? people[1];
  const [status, setStatus] = useState<"connecting" | "connected">("connecting");
  const [muted, setMuted] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setStatus("connected"), 1500); return () => window.clearTimeout(timer); }, []);
  return <PageShell nav={false} className="min-h-[100dvh] flex flex-col items-center justify-between p-6 bg-gradient-to-b from-[#20102b] to-[#0d0b14]"><div className="w-full flex justify-between items-center"><span className="text-white/60 text-sm">{params.kind === "video" ? "Video call" : "Voice call"}</span><button aria-label="Close call" onClick={() => navigate(`/chat/${contact.id}`)}><X size={22} /></button></div><div className="flex flex-col items-center gap-4"><Avatar user={contact} size="lg" ring /><h1 className="text-2xl font-bold">{contact.displayName}</h1><p className="text-white/50 text-sm">{status === "connecting" ? "Connecting…" : "Connected"}</p>{status === "connected" && params.kind === "video" && <div className="w-56 h-32 rounded-2xl overflow-hidden border border-white/10"><img src={contact.avatar} alt="" className="w-full h-full object-cover" /></div>}</div><div className="flex items-center gap-4"><button onClick={() => setMuted(!muted)} className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? "bg-white text-black" : "bg-white/10"}`}><Bell size={20} /></button><button onClick={() => navigate(`/chat/${contact.id}`)} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center"><Phone size={24} className="rotate-[135deg]" /></button></div></PageShell>;
}

function Settings() {
  const [, navigate] = useLocation();
  const { activeUser } = useDemo();
  const [logout, setLogout] = useState(false);
  const sections = [{ title: "Account", color: "#ff3d9a", items: [["Edit Profile", "/profile/edit", User], ["Username & Email", "/settings/account", User], ["Verify Account", "/account/verify", Check]] }, { title: "Privacy", color: "#b054ff", items: [["Privacy", "/settings/privacy", Eye], ["Blocked Users", "/blocked-users", Lock]] }, { title: "Security", color: "#ff6eb4", items: [["Two-factor authentication", "/settings/security", Shield], ["Active sessions", "/settings/security", Shield]] }, { title: "About", color: "#7eb9ff", items: [["Help Center", "/help", CircleHelp], ["Feedback", "/feedback", MessageCircle], ["App version 1.0.0", "/settings/about", Info]] }] as const;
  return <PageShell><TopBar title="Settings" /><button onClick={() => navigate("/profile")} className="w-full flex items-center gap-3 px-4 py-4 border-b border-white/[.06] text-left"><Avatar user={activeUser} size="md" ring /><div className="flex-1"><p className="font-semibold">{activeUser.displayName}</p><p className="text-white/50 text-sm">@{activeUser.username}</p></div><ChevronRight size={18} className="text-white/30" /></button>{sections.map((section) => <div key={section.title} className="px-4 py-4 border-b border-white/[.06]"><p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">{section.title}</p><div className="rounded-2xl overflow-hidden bg-white/[.03] border border-white/[.07]">{section.items.map(([label, href, Icon], index) => <button key={label} onClick={() => navigate(href)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left" style={{ borderBottom: index < section.items.length - 1 ? "1px solid rgba(255,255,255,.06)" : "none" }}><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${section.color}18` }}><Icon size={16} style={{ color: section.color }} /></span><span className="flex-1 text-white/80 text-sm">{label}</span><ChevronRight size={14} className="text-white/25" /></button>)}</div></div>)}<div className="px-4 py-4"><button onClick={() => setLogout(true)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20"><LogOut size={18} className="text-red-400" /><span className="text-red-400 font-medium text-sm">Log out</span></button></div>{logout && <ConfirmModal title="Log out?" body="You can come back anytime." onCancel={() => setLogout(false)} onConfirm={() => { localStorage.removeItem("yuniko-demo-auth"); navigate("/login"); }} />}</PageShell>;
}
function ConfirmModal({ title, body, onCancel, onConfirm }: { title: string; body: string; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-6"><div className="w-full max-w-sm rounded-2xl overflow-hidden bg-[#120f1e] border border-white/10"><div className="p-6"><h3 className="font-bold text-lg mb-2">{title}</h3><p className="text-white/60 text-sm">{body}</p></div><div className="flex border-t border-white/10"><button onClick={onCancel} className="flex-1 py-4 text-white/60 border-r border-white/10">Cancel</button><button onClick={onConfirm} className="flex-1 py-4 text-red-400 font-semibold">Confirm</button></div></div></div>; }

function PostDetail() { const params = useParams<{ postId?: string }>(); const { state } = useDemo(); const post = state.posts.find((item) => item.id === params.postId) ?? state.posts[0]; return <PageShell><TopBar title="Post" /><div className="max-w-2xl mx-auto px-3 pt-3"><div className="aspect-[4/5] rounded-2xl overflow-hidden"><PostCard post={post} /></div></div></PageShell>; }
function FollowersPage({ mode }: { mode: "followers" | "following" }) { const [, navigate] = useLocation(); const { state, getUser } = useDemo(); const params = useParams<{ userId?: string }>(); const user = getUser(params.userId); const list = people.filter((person) => person.id !== user.id && (mode === "following" ? state.following.includes(person.id) || person.id === "1" : true)); return <PageShell><TopBar title={mode === "followers" ? "Followers" : "Following"} /><div className="px-4 py-4"><p className="text-white/45 text-sm mb-4">{user.displayName} · {list.length} people</p>{list.map((person) => <button key={person.id} onClick={() => navigate(`/user/${person.id}`)} className="w-full flex items-center gap-3 py-3 text-left"><Avatar user={person} size="md" ring /><div><p className="font-semibold text-sm">{person.displayName}</p><p className="text-white/45 text-xs">@{person.username}</p></div><ChevronRight size={16} className="ml-auto text-white/25" /></button>)}</div></PageShell>; }
function EditProfilePage() { const [, navigate] = useLocation(); const { activeUser, updateProfile, showToast } = useDemo(); const [name, setName] = useState(activeUser.displayName); const [username, setUsername] = useState(activeUser.username); const [bio, setBio] = useState(activeUser.bio); const save = (event: FormEvent) => { event.preventDefault(); if (name.trim().length < 2 || username.trim().length < 3) return; updateProfile({ displayName: name.trim(), username: username.trim(), bio: bio.trim() }); showToast("Profile updated"); navigate("/profile"); }; return <PageShell><TopBar title="Edit profile" /><form onSubmit={save} className="max-w-xl mx-auto px-4 py-6 space-y-4"><div className="flex justify-center mb-6"><Avatar user={activeUser} size="lg" ring /></div><LabeledInput label="Display name" value={name} onChange={setName} /><LabeledInput label="Username" value={username} onChange={setUsername} /><label className="block text-sm text-white/60">Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl bg-white/[.06] border border-white/10 px-4 py-3 text-sm outline-none resize-none" /></label><button className="w-full py-3.5 rounded-2xl font-semibold" style={{ background: GRADIENT }}>Save changes</button></form></PageShell>; }
function LabeledInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm text-white/60">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl bg-white/[.06] border border-white/10 px-4 py-3 text-sm outline-none" /></label>; }
function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: () => void }) { return <button onClick={onChange} className="w-full flex items-center gap-3 py-4 text-left border-b border-white/[.06]"><div className="flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-white/45 mt-1">{description}</p></div><span className={`w-11 h-6 rounded-full p-0.5 transition-colors ${value ? "bg-pink-500" : "bg-white/15"}`}><span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : ""}`} /></span></button>; }
function SettingsDetail({ kind }: { kind: "privacy" | "security" | "storage" | "account" | "blocked" | "verify" }) {
  const [, navigate] = useLocation();
  const { state, activeUser, updateState, toggleBlocked, showToast } = useDemo();
  const titles = { privacy: "Privacy", security: "Security", storage: "Storage", account: "Username & Email", blocked: "Blocked users", verify: "Verify account" };
  if (kind === "account") return <PageShell><TopBar title={titles[kind]} /><form className="max-w-xl mx-auto px-4 py-6 space-y-4" onSubmit={(event) => { event.preventDefault(); showToast("Account details saved"); }}><LabeledInput label="Username" value={activeUser.username} onChange={(value) => updateState({ profile: { ...state.profile, username: value } })} /><LabeledInput label="Email" value={state.accountEmail} onChange={(value) => updateState({ accountEmail: value })} type="email" /><button className="w-full py-3.5 rounded-2xl font-semibold" style={{ background: GRADIENT }}>Save account</button></form></PageShell>;
  if (kind === "storage") return <PageShell><TopBar title={titles[kind]} /><div className="px-4 py-6 max-w-xl mx-auto"><div className="rounded-2xl bg-white/[.04] border border-white/[.07] p-5 mb-5"><p className="text-white/45 text-xs uppercase tracking-wider">Local demo storage</p><p className="text-3xl font-bold mt-2">{Math.max(1, state.posts.length * 4)} MB</p><p className="text-white/45 text-sm mt-1">Saved posts, messages and preferences on this device.</p></div><button onClick={() => { localStorage.removeItem("yuniko-media-cache"); showToast("Cached media cleared"); }} className="w-full py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">Clear cached media</button></div></PageShell>;
  if (kind === "blocked") return <PageShell><TopBar title={titles[kind]} /><div className="px-4 py-5">{state.blocked.length === 0 ? <EmptyState icon={<Lock size={26} />} title="No blocked users" body="Accounts you block will appear here." /> : state.blocked.map((id) => { const person = people.find((item) => item.id === id); return person ? <div key={id} className="flex items-center gap-3 py-3 border-b border-white/5"><Avatar user={person} size="md" /><div className="flex-1"><p className="font-semibold text-sm">{person.displayName}</p><p className="text-white/45 text-xs">@{person.username}</p></div><button onClick={() => toggleBlocked(id)} className="px-3 py-2 rounded-full bg-white/10 text-xs">Unblock</button></div> : null; })}</div></PageShell>;
  if (kind === "verify") return <PageShell><TopBar title={titles[kind]} /><div className="px-6 py-16 max-w-xl mx-auto text-center"><div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center bg-blue-500/10 border border-blue-400/20"><Check size={36} className="text-blue-300" /></div><h2 className="text-xl font-bold mt-5">Verification status</h2><p className="text-white/50 text-sm mt-2">Your demo profile is ready to request verification.</p><button onClick={() => showToast("Verification request sent")} className="mt-6 px-5 py-3 rounded-2xl font-semibold" style={{ background: GRADIENT }}>Request verification</button></div></PageShell>;
  return <PageShell><TopBar title={titles[kind]} /><div className="px-4 py-4 max-w-xl mx-auto">{kind === "privacy" ? <><ToggleRow label="Private profile" description="Only approved followers can see your posts." value={state.privateProfile} onChange={() => updateState({ privateProfile: !state.privateProfile })} /><ToggleRow label="Message requests" description="Allow new people to start a conversation." value={state.messageRequests} onChange={() => updateState({ messageRequests: !state.messageRequests })} /><ToggleRow label="Push notifications" description="Keep up with likes, replies and follows." value={state.notifications} onChange={() => updateState({ notifications: !state.notifications })} /></> : <><ToggleRow label="Two-factor authentication" description="Add another step when signing in." value={state.twoFactor} onChange={() => updateState({ twoFactor: !state.twoFactor })} /><ToggleRow label="Login alerts" description="Get notified about new sign-ins." value={state.loginAlerts} onChange={() => updateState({ loginAlerts: !state.loginAlerts })} /></>}<button onClick={() => navigate("/settings")} className="mt-8 text-pink-400 text-sm">Back to settings</button></div></PageShell>;
}
function HelpPage() { const [query, setQuery] = useState(""); const [open, setOpen] = useState<number | null>(null); const faqs = ["How do I share a post?", "How do I change my profile?", "How do I manage notifications?", "How do I report an account?"]; const results = faqs.filter((faq) => faq.toLowerCase().includes(query.toLowerCase())); return <PageShell><TopBar title="Help Center" /><div className="max-w-xl mx-auto px-4 py-5"><div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/[.06] border border-white/[.08]"><SearchIcon size={16} className="text-white/40" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search help" className="flex-1 bg-transparent text-sm outline-none" /></div><div className="mt-6 rounded-2xl overflow-hidden border border-white/[.07]">{results.map((faq, index) => <div key={faq} className="border-b border-white/[.07] last:border-0"><button onClick={() => setOpen(open === index ? null : index)} className="w-full flex items-center gap-3 px-4 py-4 text-left text-sm"><CircleHelp size={17} className="text-pink-400" /><span className="flex-1">{faq}</span><ChevronDown size={16} className={`transition-transform ${open === index ? "rotate-180" : ""}`} /></button>{open === index && <p className="px-12 pb-4 text-sm text-white/50">You can complete this action directly from the matching Yuniko screen. Changes are saved locally in this demo.</p>}</div>)}</div></div></PageShell>; }
function FeedbackPage() { const { showToast } = useDemo(); const [text, setText] = useState(""); return <PageShell><TopBar title="Feedback" /><form className="max-w-xl mx-auto px-4 py-6" onSubmit={(event) => { event.preventDefault(); if (!text.trim()) return; setText(""); showToast("Thanks for your feedback"); }}><h2 className="text-xl font-bold">Tell us what you think</h2><p className="text-white/45 text-sm mt-2 mb-5">Your feedback helps shape the next version of Yuniko.</p><textarea required value={text} onChange={(event) => setText(event.target.value)} rows={7} placeholder="Write your feedback…" className="w-full rounded-2xl bg-white/[.06] border border-white/10 px-4 py-3 text-sm outline-none resize-none" /><button className="w-full mt-4 py-3.5 rounded-2xl font-semibold" style={{ background: GRADIENT }}>Send feedback</button></form></PageShell>; }
function AboutPage() { const { showToast } = useDemo(); return <PageShell><TopBar title="About Yuniko" /><div className="px-6 py-12 max-w-xl mx-auto text-center"><div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center" style={{ background: GRADIENT }}><Sparkles size={38} /></div><h2 className="text-2xl font-black mt-5 gradient-text">Yuniko</h2><p className="text-white/50 text-sm mt-2">A vivid social space by Aora Group.</p><p className="text-white/35 text-xs mt-2">Version 1.0.0</p><button onClick={() => showToast("Terms opened")} className="mt-8 text-pink-400 text-sm">Terms and privacy</button></div></PageShell>; }

function AnimatedRoutes({ onLogin }: { onLogin: () => void }) {
  const [location] = useLocation();
  const previous = useRef(location);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  useEffect(() => { if (location !== previous.current) { setDirection("forward"); previous.current = location; } }, [location]);
  return <div className="relative overflow-hidden yuniko-route-shell"><AnimatePresence mode="popLayout" initial={false}><motion.div key={location} initial={{ x: direction === "forward" ? "100%" : "-100%" }} animate={{ x: 0 }} exit={{ x: direction === "forward" ? "-100%" : "100%" }} transition={{ duration: .22, ease: [0.25, .1, .25, 1] }} className="yuniko-route-page"><Switch><Route path="/login"><Login onLogin={onLogin} /></Route><Route path="/" component={Home} /><Route path="/notifications" component={Notifications} /><Route path="/create" component={Create} /><Route path="/messages" component={Messages} /><Route path="/profile"><Profile /></Route><Route path="/user/:userId">{(params) => <Profile userId={params.userId} />}</Route><Route path="/settings" component={Settings} /><Route path="/search" component={SearchPage} /><Route path="/story/:id" component={StoryPage} /><Route path="/chat/:userId" component={Chat} /><Route path="/call/:userId/:kind" component={CallPage} /><Route path="/post/:postId" component={PostDetail} /><Route path="/followers/:userId">{() => <FollowersPage mode="followers" />}</Route><Route path="/following/:userId">{() => <FollowersPage mode="following" />}</Route><Route path="/profile/edit" component={EditProfilePage} /><Route path="/settings/account">{() => <SettingsDetail kind="account" />}</Route><Route path="/settings/privacy">{() => <SettingsDetail kind="privacy" />}</Route><Route path="/settings/security">{() => <SettingsDetail kind="security" />}</Route><Route path="/settings/storage">{() => <SettingsDetail kind="storage" />}</Route><Route path="/blocked-users">{() => <SettingsDetail kind="blocked" />}</Route><Route path="/account/verify">{() => <SettingsDetail kind="verify" />}</Route><Route path="/help" component={HelpPage} /><Route path="/feedback" component={FeedbackPage} /><Route path="/settings/about" component={AboutPage} /><Route path="/add-friends">{() => <SearchPage />}</Route><Route component={() => <PageShell><TopBar title="Page not found" /><EmptyState icon={<X size={28} />} title="Page not found" body="This Yuniko page does not exist." /></PageShell>} /></Switch></motion.div></AnimatePresence></div>;
}
function DemoRouter({ splash, onLogin }: { splash: boolean; onLogin: () => void }) {
  const [location, navigate] = useLocation();
  useEffect(() => { if (!splash && !localStorage.getItem("yuniko-demo-auth") && location !== "/login") navigate("/login"); }, [location, navigate, splash]);
  return <>{!splash && !localStorage.getItem("yuniko-demo-auth") && location !== "/login" ? null : <AnimatedRoutes onLogin={onLogin} />}</>;
}
export default function App() {
  const [splash, setSplash] = useState(true);
  const doneSplash = useCallback(() => setSplash(false), []);
  const onLogin = useCallback(() => { localStorage.setItem("yuniko-demo-auth", "1"); }, []);
  return <StoreProvider><Router base={import.meta.env.BASE_URL.replace(/\/$/, "")}><div className="yuniko-root"><AnimatePresence>{splash && <Splash onDone={doneSplash} />}</AnimatePresence>{!splash ? <DemoRouter splash={splash} onLogin={onLogin} /> : <div className="min-h-screen" />}</div></Router></StoreProvider>;
}