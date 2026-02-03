import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  FolderOpen,
  Tag,
  Zap,
  ArrowRight,
  Check,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function Index() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const API_BASE =
    (import.meta as any).env?.VITE_API_BASE ||
    (window as any).__API_BASE__ ||
    "http://127.0.0.1:5001/api";

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleSave = async () => {
  if (!url.trim() || isLoading) return;
  setIsLoading(true);

  const client_temp_id = `temp_${Date.now()}`;
  const cleanUrl = url.split("?")[0];

  navigate(
    `/gallery?new=${client_temp_id}&url=${encodeURIComponent(cleanUrl)}`
  );

  try {
    // ✅ Use FormData instead of URLSearchParams
    const formData = new FormData();
    formData.append("url", cleanUrl);
    formData.append("save_to_gcs", "true");

    const resp = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      // ✅ Remove Content-Type header - browser sets it automatically for FormData
      body: formData,
    });

    if (!resp.ok) {
      const errorData = await resp.json();
      console.error("Backend error:", errorData);
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();

    const existing = JSON.parse(localStorage.getItem("savedReels") || "[]");
    const withoutTemp = existing.filter(
      (r: any) => r.client_temp_id !== client_temp_id
    );

    const realRecord = {
      process_id: data.reel_id,
      status: data.status || "processing",
      folder_id: "default",
      source_url: cleanUrl,
      created_at: new Date().toISOString(),
      summary: { title: "Processing…" },
      gcs_urls: {
        preview_thumbnail: data.preview_url || null,
        thumbnail: null,
      },
      client_temp_id,
    };

    localStorage.setItem(
      "savedReels",
      JSON.stringify([realRecord, ...withoutTemp])
    );
  } catch (err) {
    console.error("Import failed:", err);

    const existing = JSON.parse(localStorage.getItem("savedReels") || "[]");
    const updated = existing.map((r: any) =>
      r.client_temp_id === client_temp_id ? { ...r, status: "failed" } : r
    );
    localStorage.setItem("savedReels", JSON.stringify(updated));

    alert("Failed to import this URL.");
  } finally {
    setIsLoading(false);
  }
};

  const steps = [
    { number: "1", title: "Paste Link", description: "Share any public Instagram Reel URL" },
    { number: "2", title: "Auto-Organize", description: "Our AI categorizes and extracts key information" },
    { number: "3", title: "Explore & Share", description: "Browse your collection and discover similar content" },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* HERO */}
      <section
        className="
          relative bg-gradient-to-b from-slate-50 to-white
          pt-4 pb-4 md:pt-6 md:pb-6 px-4
        "
      >
        <div className="max-w-7xl mx-auto">

          {/* BG visual bubbles */}
          <div className="absolute top-10 right-10 w-96 h-96 bg-violet-200 rounded-full blur-3xl opacity-20 -z-10"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-200 rounded-full blur-3xl opacity-20 -z-10"></div>

          <div className="text-center mb-6">
            <div className="inline-block mb-8 px-6 py-1.5 bg-violet-100 rounded-full">
              <span className="text-sm font-medium text-violet-700">
                ✨ Save & Organize Short Videos
              </span>
            </div>

            {/* FULL descender-safe H1 */}
            <h1
              className="
                text-5xl md:text-6xl font-bold mb-8
                bg-gradient-to-r from-slate-900 via-violet-900 to-slate-900
                bg-clip-text text-transparent mx-auto
                max-w-sm md:max-w-none
                leading-normal md:whitespace-nowrap
                pb-3
              "
            >
              Your Personal Video Library
            </h1>

            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
              Save Instagram Reels, organize them into collections, and let AI help you categorize what matters most.
            </p>
          </div>

          {/* INPUT BLOCK */}
          <div className="max-w-2xl mx-auto mb-0">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-2">

              <div className="flex flex-row gap-2 mobile-input-row w-full min-w-0">

                <input
                  type="text"
                  placeholder="Paste Video URL here"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm sm:px-6 sm:py-4 sm:text-base
                             bg-transparent outline-none text-slate-900
                             placeholder:text-slate-400 min-w-0"
                />

                {/* Paste button */}
                <button
                  onClick={handlePaste}
                  className="mobile-paste-btn px-3 py-2 text-sm sm:px-6 sm:py-4 sm:text-base
                             text-slate-700 font-medium hover:bg-slate-100 rounded-xl
                             transition-colors flex items-center justify-center gap-2 flex-shrink-0"
                >
                  <img
                    src="/paste-dual-tone-icon.svg"
                    className="paste-icon hidden"
                    alt=""
                  />
                  <span className="paste-text">Paste</span>
                </button>

                {/* Save button */}
                <button
                  onClick={handleSave}
                  disabled={!url.trim() || isLoading}
                  className="px-4 py-2 text-sm sm:px-8 sm:py-4 sm:text-base
                             bg-gradient-to-r from-violet-600 to-indigo-600
                             text-white font-medium rounded-xl hover:shadow-lg
                             transition-all disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    <>Save Reel</>
                  )}
                </button>

              </div>
            </div>

            {/* Quick tips */}
            <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Public videos only</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Privacy respected</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <span>Fast & reliable</span>
              </div>
            </div>
          </div>

          {/* HOW IT WORKS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 mt-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">
              How It Works
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              {steps.map((s) => (
                <div key={s.number}>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white flex items-center justify-center font-bold text-lg mb-4">
                      {s.number}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                    <p className="text-slate-600 text-sm">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="pt-4 pb-6 md:pt-2 md:pb-10 px-4 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Ready to get started?
          </h2>
          <p className="text-lg text-slate-600 mb-6">
            Scroll up to save your first Instagram Reel or explore our gallery
          </p>
          <Link
            to="/gallery"
            className="inline-flex items-center gap-2 px-12 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium rounded-xl hover:shadow-lg transition-all"
          >
            View Gallery
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
