import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Heart, Trash2 } from "lucide-react";

import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { MobileMenuDrawer } from "@/components/MobileMenuDrawer";
import { Footer } from "@/components/Footer";
import { normalizeReel } from "@/services/normalizeReel";
import { getAuthHeaders } from "@/contexts/AuthContext";

type Reel = ReturnType<typeof normalizeReel>;

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (window as any).__API_BASE__ ||
  "http://127.0.0.1:5001/api";

function joinUrl(base: string, path: string) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

export default function Gallery() {
  const { id: folderParam } = useParams();
  const [searchParams] = useSearchParams();
  const folderId = folderParam || "all";

  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reels, setReels] = useState<Reel[]>([]);
  const [isManaging, setIsManaging] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleFavorite = (reel: Reel) => {
    const id = reel.process_id;
    if (!id) return;

    const updated = reels.map((r) =>
      r.process_id === id ? { ...r, is_favorite: !r.is_favorite } : r
    );

    setReels(updated);
    localStorage.setItem("savedReels", JSON.stringify(updated));
  };

  useEffect(() => {
    const newTempId = searchParams.get("new");
    const newUrl = searchParams.get("url");

    if (newTempId && newUrl) {
      const temp: Reel = {
        id: newTempId,
        process_id: newTempId,
        isTemp: true,
        is_favorite: false,
        status: "processing",
        folder_id: "default",
        source_url: decodeURIComponent(newUrl),
        created_at: new Date().toISOString(),
        summary: { title: "Processing…" },
        gcs_urls: { thumbnail: null, preview_thumbnail: null },
        caption: "",
        author_name: "",
        transcription: { transcript: "" },
      } as Reel;

      setReels((prev) => [temp, ...prev]);
      navigate("/gallery/all", { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    const fetchReels = async () => {
      try {
        const res = await fetch(
          joinUrl(API_BASE, "saved_reels"),
          {
            method: "GET",
            credentials: "include",
            headers: {
              ...getAuthHeaders(),
            },
          }
        );

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Failed to fetch reels: HTTP ${res.status} ${text}`);
        }

        const payload = await res.json();
        const rows = Array.isArray(payload) ? payload : payload?.reels || [];
        const backend: Reel[] = rows.map((r: any) => normalizeReel(r));

        setReels((current) => {
          const normalizeUrl = (url: string) => {
            try {
              const u = new URL(url);
              return `${u.origin}${u.pathname}`.replace(/\/$/, "");
            } catch {
              return String(url || "").split("?")[0].replace(/\/$/, "");
            }
          };

          const updated = [...current];

          backend.forEach((b) => {
            const backendUrl = normalizeUrl(b.source_url || "");

            const tempIndex = updated.findIndex((r) => {
              if (!(r as any).isTemp) return false;
              const tempUrl = normalizeUrl(r.source_url || "");
              return tempUrl === backendUrl;
            });

            if (tempIndex !== -1) {
              updated[tempIndex] = { ...b, isTemp: false } as Reel;
            } else {
              const exist = updated.findIndex(
                (r) => r.process_id === b.process_id
              );
              if (exist !== -1) updated[exist] = b;
              else updated.push(b);
            }
          });

          const localFavs = new Map(
            current
              .filter((r) => !(r as any).isTemp)
              .map((r) => [r.process_id, r.is_favorite || false])
          );

          const finalList = updated.map((r) => ({
            ...r,
            is_favorite: localFavs.get(r.process_id) || false,
          }));

          localStorage.setItem("savedReels", JSON.stringify(finalList));
          return finalList;
        });
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchReels();
    const interval = setInterval(fetchReels, 3000);
    return () => clearInterval(interval);
  }, []);

  const deleteReel = async (processId: string) => {
    try {
      await fetch(joinUrl(API_BASE, `reel/${encodeURIComponent(processId)}`), {
        method: "DELETE",
        credentials: "include",
        headers: {
          ...getAuthHeaders(),
        },
      });
    } catch (err) {
      console.warn("Delete error:", err);
    }

    setReels((prev) => {
      const updated = prev.filter((r) => r.process_id !== processId);
      localStorage.setItem("savedReels", JSON.stringify(updated));
      return updated;
    });
  };

  const visible = useMemo(() => {
    if (folderId === "favorites") return reels.filter((r) => r.is_favorite);
    return reels.filter((r) =>
      folderId === "all" ? true : (r.folder_id || "default") === folderId
    );
  }, [folderId, reels]);

  const folderName =
    folderId === "all"
      ? "All my videos"
      : folderId === "favorites"
        ? "Favorites"
        : folderId.charAt(0).toUpperCase() + folderId.slice(1);

  const toggleSelect = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const openReel = (r: Reel) => {
    if (isManaging) {
      toggleSelect(r.process_id);
      return;
    }
    if (r.status === "done") navigate(`/reel/${r.process_id}`);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header showSearch onMenuClick={() => setMobileMenuOpen(true)} />

      {mobileMenuOpen && <style>{`body { overflow: hidden; }`}</style>}

      <MobileMenuDrawer
        isOpen={mobileMenuOpen}
        onClose={() => {
          setMobileMenuOpen(false);
          document.body.style.overflow = "auto";
        }}
      />

      <div className="flex flex-1 max-w-[1100px] mx-auto w-full">
        <Sidebar />

        <main className="flex-1 w-full">
          <div className="flex items-center justify-between mt-5 mb-4 px-4 h-[48px]">
            <h2 className="text-lg font-semibold text-slate-900">{folderName}</h2>

            <div className="flex items-center gap-3">
              {isManaging && selected.length > 0 && (
                <button
                  onClick={async () => {
                    for (const id of selected) await deleteReel(id);
                    setSelected([]);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}

              <button
                onClick={() => {
                  setIsManaging(!isManaging);
                  setSelected([]);
                }}
                className={`px-4 py-2 rounded-lg font-medium text-sm ${
                  isManaging
                    ? "bg-violet-100 text-violet-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {isManaging ? "Done" : "Manage"}
              </button>
            </div>
          </div>

          <div className="px-4 pb-6">
            {visible.length === 0 ? (
              <div className="text-center text-slate-600 py-16">
                No videos found here.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                {visible.map((r) => {
                  const processing = r.status !== "done";
                  const thumb = r.gcs_urls?.preview_thumbnail || null;
                  const title = r.summary?.title || "Imported Reel";
                  const selectedState = selected.includes(r.process_id);

                  return (
                    <div key={r.process_id} className="relative">
                      <div
                        onClick={() => openReel(r)}
                        className={`relative block aspect-[9/16] rounded-lg bg-slate-900 overflow-hidden ${
                          processing ? "cursor-default" : "cursor-pointer"
                        }`}
                      >
                        {!thumb && <div className="placeholder-skeleton" />}

                        {thumb && (
                          <img
                            src={thumb}
                            alt={title}
                            className={`absolute inset-0 w-full h-full object-cover ${
                              processing ? "blur-sm opacity-80" : "opacity-100"
                            }`}
                          />
                        )}

                        {processing && (
                          <div className="processing-overlay">
                            <div className="spinner" />
                            <span>Processing reel</span>
                          </div>
                        )}

                        {!processing && !isManaging && (
                          <div
                            className="favorite-heart"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(r);
                            }}
                          >
                            <Heart
                              className={
                                r.is_favorite ? "favorited heart-animate" : ""
                              }
                            />
                          </div>
                        )}

                        {isManaging && (
                          <>
                            <div className="modern-radio">
                              <div
                                className={`radio-circle ${
                                  selectedState ? "radio-active" : ""
                                }`}
                              />
                            </div>

                            {selectedState && (
                              <div className="selected-overlay" />
                            )}
                          </>
                        )}
                      </div>

                      {!processing && (
                        <div className="pt-2">
                          <h3 className="font-bold text-sm text-slate-900 leading-tight line-clamp-2">
                            {title}
                          </h3>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}