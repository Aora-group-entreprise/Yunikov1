import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, Hash, MapPin, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

const GRADIENT = "linear-gradient(135deg,#FF006E 0%,#8B00FF 100%)";

export default function Create() {
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const storyMode = params.get("mode") === "story";
  const [caption, setCaption] = useState("");
  const [location, setPostLocation] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [image, setImage] = useState("");

  const publish = (event: FormEvent) => {
    event.preventDefault();
    const cleanCaption = caption.trim();
    if (!cleanCaption && !image.trim()) return;
    const payload = {
      id: `${storyMode ? "s" : "p"}-${Date.now()}`,
      caption: cleanCaption,
      image: image.trim() || "/scene-neon.jpg",
      location: location.trim() || undefined,
      hashtags: hashtags
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .map((tag) => `#${tag}`),
      createdAt: Date.now(),
    };
    localStorage.setItem("yuniko-last-create", JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("yuniko:create", { detail: payload }));
    navigate("/");
  };

  return (
    <div className="w-full min-h-screen bg-[#0d0b14] text-white pb-20">
      <header className="sticky top-0 z-40 px-4 py-4 flex items-center gap-3 glass border-b border-white/[.06]">
        <button aria-label="Back" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/")}>
          <ArrowLeft size={22} className="text-white/80" />
        </button>
        <h1 className="text-base font-semibold flex-1">{storyMode ? "Create story" : "Create post"}</h1>
      </header>

      <form onSubmit={publish} className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <div className="rounded-3xl overflow-hidden border border-white/[.08] bg-white/[.04] aspect-[4/3] flex items-center justify-center">
          {image.trim() ? (
            <img src={image.trim()} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-white/35 px-8">
              <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center bg-white/[.06] border border-white/[.08]">
                <Camera size={28} className="text-pink-400" />
              </div>
              <p className="mt-3 text-sm">Add an image URL for the preview</p>
            </div>
          )}
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-white/40">Image URL</span>
          <input value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://..." className="mt-2 w-full px-4 py-3.5 rounded-2xl bg-white/[.06] border border-white/10 outline-none text-sm" />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-white/40">Caption</span>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={5} maxLength={5000} placeholder={storyMode ? "Say something about your story..." : "Write a caption..."} className="mt-2 w-full px-4 py-3.5 rounded-2xl bg-white/[.06] border border-white/10 outline-none resize-none text-sm" />
        </label>

        {!storyMode && (
          <label className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[.06] border border-white/10">
            <Hash size={18} className="text-pink-400" />
            <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="hashtags" className="flex-1 bg-transparent outline-none text-sm" />
          </label>
        )}

        <label className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/[.06] border border-white/10">
          <MapPin size={18} className="text-pink-400" />
          <input value={location} onChange={(event) => setPostLocation(event.target.value)} placeholder="Add a location (optional)" className="flex-1 bg-transparent outline-none text-sm" />
        </label>

        <button type="submit" className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2" style={{ background: GRADIENT }}>
          <Sparkles size={17} /> {storyMode ? "Share story" : "Publish post"}
        </button>
      </form>
    </div>
  );
}
