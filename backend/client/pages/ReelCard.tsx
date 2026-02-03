import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Trash2,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MobileMenuDrawer } from "@/components/MobileMenuDrawer";
import { Footer } from "@/components/Footer";

import { normalizeReel } from "@/services/normalizeReel";
type Reel = ReturnType<typeof normalizeReel>;

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (window as any).__API_BASE__ ||
  "http://127.0.0.1:5001/api";

export default function ReelCard() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reel, setReel] = useState<Reel | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // --------------------------------------------------------
  // LOAD REEL
  // --------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/saved_reels`);
        const rows = await res.json();

        const foundRemote = rows.find(
          (r: any) =>
            r.id === id ||
            r.process_id === id ||
            (r.id && id?.includes(r.id))
        );

        if (foundRemote) {
          setReel(normalizeReel(foundRemote));
          return;
        }
      } catch {
        console.warn("Backend unreachable, fallback to localStorage.");
      }

      const raw = JSON.parse(localStorage.getItem("savedReels") || "[]");
      const foundLocal = raw.find(
        (r: any) =>
          r.process_id === id ||
          r.id === id ||
          (r.process_id && id?.includes(r.process_id))
      );

      setReel(foundLocal ? normalizeReel(foundLocal) : null);
    }

    load();
  }, [id]);

  if (!reel)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        Loading reel…
      </div>
    );

  // --------------------------------------------------------
  // DELETE REEL
  // --------------------------------------------------------
  const handleDelete = async () => {
    try {
      await fetch(`${API_BASE}/delete_reel/${reel.process_id}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Delete API failed:", err);
    }

    const all = JSON.parse(localStorage.getItem("savedReels") || "[]");
    const updated = all.filter(
      (r: any) => r.process_id !== reel.process_id && r.id !== reel.id
    );
    localStorage.setItem("savedReels", JSON.stringify(updated));

    setConfirmDelete(false);
    navigate("/gallery/all");
  };

  // --------------------------------------------------------
  // FORMATTING
  // --------------------------------------------------------
  const thumb =
    reel.gcs_urls?.thumbnail ||
    reel.gcs_urls?.preview_thumbnail ||
    "/no-thumbnail.png";

  const transcript =
    typeof reel.transcription === "string"
      ? reel.transcription
      : reel.transcription?.transcript || "";

  const formattedDate = reel.created_at
    ? new Date(reel.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  const validEmojis = (reel.summary?.emojis || []).filter(
    (emoji: string) => emoji && emoji.trim() !== ""
  );

  const author = reel.author_name || "creator";
  const igUrl = `https://www.instagram.com/${author.replace("@", "")}`;

  // --------------------------------------------------------
  // INSTAGRAM LOGO SVG
  // --------------------------------------------------------
    const InstagramLogo = (
      <img
        src="/instagram_logo.png"
        alt="Instagram"
        className="w-8 h-8 rounded-full object-cover"
      />
    );

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header showSearch onMenuClick={() => setMobileMenuOpen(true)} />

      <MobileMenuDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex flex-1 max-w-[1100px] mx-auto w-full">
        <Sidebar />

        <main className="flex-1 w-full">
          <div className="p-5 grid lg:grid-cols-3 gap-8">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-2">
              {/* Thumbnail */}
              <div className="mb-6 rounded-xl overflow-hidden bg-black relative">
                <img
                  src={thumb}
                  alt={reel.summary?.title || "Reel"}
                  className="w-full aspect-[9/8] object-cover"
                />

                <Link
                  to="/gallery/all"
                  className="absolute top-3 left-3 bg-white/80 hover:bg-white rounded-lg p-2 shadow-sm transition"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-700" />
                </Link>

                {reel.duration && (
                  <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded">
                    {reel.duration}
                  </div>
                )}
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-slate-900 mb-4">
                {reel.summary?.title || "Untitled"}
              </h1>

              {/* Author + Date */}
              <div className="flex items-center justify-between mb-5">

                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 hover:opacity-80 transition"
                >
                  {/* INSTAGRAM LOGO */}
                  {InstagramLogo}

                  {/* Username */}
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      @{author.replace("@", "")}
                    </div>
                  </div>
                </a>

                {formattedDate && (
                  <div className="text-sm text-slate-500">
                    Saved on {formattedDate}
                  </div>
                )}
              </div>

              {/* Bullets */}
              {reel.summary?.bullets && reel.summary.bullets.length > 0 && (
                <div className="mb-8">
                  <ul className="space-y-3">
                    {reel.summary.bullets.map((b, i) => {
                      const emoji = validEmojis[i] || "•";
                      return (
                        <li key={i} className="flex gap-3 items-start">
                          <span className="text-xl min-w-[28px]">{emoji}</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900 mb-1">
                              {b.headline}
                            </p>
                            <p className="text-sm text-slate-700">
                              {b.text}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Caption */}
              {reel.caption && (
                <div className="mb-8 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50 font-medium text-slate-900">
                    Original Caption
                  </div>
                  <div className="px-6 py-4 bg-slate-50 text-sm text-slate-700 whitespace-pre-line border-t border-slate-200">
                    {reel.caption}
                  </div>
                </div>
              )}

              {/* Transcript */}
              {transcript.length > 0 && (
                <div className="mb-8 border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 font-medium text-slate-900 transition"
                  >
                    <span>Transcript</span>
                    <ChevronDown
                      className={`w-5 h-5 transition-transform ${
                        showTranscript ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {showTranscript && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-sm text-slate-700 whitespace-pre-wrap">
                      {transcript}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="hidden lg:block space-y-6">
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                <Trash2 className="w-5 h-5" />
                Delete Reel
              </button>

              {/* Instagram Link */}
              <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-6 border border-violet-200 rounded-lg">
                <div className="text-xs uppercase tracking-wide text-violet-900 font-semibold mb-3">
                  Original Source
                </div>

                <a
                  href={reel.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-white font-medium shadow-md bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 transition">
                    <ExternalLink className="w-4 h-4" />
                    View on Instagram
                  </button>
                </a>
              </div>

              {/* Category */}
              {reel.summary?.category && (
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <div className="text-xs uppercase text-slate-500 font-semibold mb-3">
                    Category
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    {reel.summary.category}
                  </p>
                </div>
              )}

              {/* Topic */}
              {reel.summary?.topic && (
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <div className="text-xs uppercase text-slate-500 font-semibold mb-3">
                    Topic
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    {reel.summary.topic}
                  </p>
                </div>
              )}

              {/* Hashtags */}
              {reel.summary?.hashtags && reel.summary.hashtags.length > 0 && (
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <div className="text-xs uppercase text-slate-500 font-semibold mb-3">
                    Hashtags
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {reel.summary.hashtags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-violet-100 text-violet-700 text-xs font-medium rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:hidden h-20"></div>
        </main>
      </div>

      {/* DELETE MODAL */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-sm p-6 text-center">
            <h2 className="text-lg font-bold text-slate-900 mb-3">
              Delete this reel?
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              This action cannot be undone.
            </p>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-5 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Cancel
              </button>

              <button
                onClick={handleDelete}
                className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
