import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Wand2, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import { Button } from "../components/Button";
import { useTranslation } from "react-i18next";

export const Home: React.FC = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");
  const navigate = useNavigate();
  const { t } = useTranslation(['home', 'common']);

  const joinUrl = (base: string, path: string) =>
    `${String(base).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError("");
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    const checkPendingVideo = async () => {
      const storedPendingUrl = localStorage.getItem("pendingVideoUrl");

      if (storedPendingUrl) {
        try {
          const authResponse = await fetch(joinUrl(API_BASE, "/api/auth/me"), {
            credentials: "include",
          });

          if (authResponse.status === 401) {
            return;
          }

          const authData = await authResponse.json();

          if (authData.authenticated) {
            localStorage.removeItem("pendingVideoUrl");
            setUrl(storedPendingUrl);
            setPendingUrl("");

            setTimeout(() => {
              handleSaveWithUrl(storedPendingUrl);
            }, 500);
          }
        } catch (err) {
          console.error("Error checking auth status:", err);
        }
      }
    };

    checkPendingVideo();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError("");
    } catch (err) {
      console.error("Failed to read clipboard contents: ", err);
    }
  };

  const handleClearUrl = () => {
    setUrl("");
    setError("");
    setPendingUrl("");
  };

  const handleSaveWithUrl = async (urlToSave: string) => {
    if (!urlToSave.trim() || isLoading) return;

    // ✅ NEW CHECK: Must contain instagram.com
    if (!urlToSave.toLowerCase().includes('instagram.com')) {
      setError(t('home:invalidUrlError', 'Please enter a valid Instagram link.'));
      return;
    }

    setIsLoading(true);
    setError("");

    const cleanUrl = urlToSave.split("?")[0];

    try {
      const formData = new FormData();
      formData.append("url", cleanUrl);

      const response = await fetch(joinUrl(API_BASE, "/api/summarize"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (response.status === 401) {
        localStorage.setItem("pendingVideoUrl", cleanUrl);
        setIsLoading(false);
        navigate("/auth");
        return;
      }

      const data = await response.json();

      if (response.status === 403) {
        if (data.code === "VERIFICATION_REQUIRED") {
          localStorage.setItem("pendingVideoUrl", cleanUrl);
          setPendingUrl(cleanUrl);
          setError(t('home:verifyError'));
          setIsLoading(false);
          return;
        }
        setError(data.error || t('home:limitError'));
        setIsLoading(false);
        return;
      }

      if (response.status === 409) {
        setError(data.error || t('home:duplicateError'));
        setUrl("");
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError(data.error || t('home:genericError'));
        setIsLoading(false);
        return;
      }

      const client_temp_id = `temp_${Date.now()}`;

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

      const existing = JSON.parse(localStorage.getItem("savedReels") || "[]");
      localStorage.setItem("savedReels", JSON.stringify([realRecord, ...existing]));

      setIsLoading(false);
      navigate(`/gallery?new=${client_temp_id}&url=${encodeURIComponent(cleanUrl)}`);
    } catch (err) {
      setError(t('home:networkError'));
      setIsLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleSaveWithUrl(url);
  };

  return (
    <div className="flex flex-col items-center animate-fade-in">
      
      {/* Hero Section - Optimized Mobile Spacing */}
      <div className="w-full max-w-4xl mx-auto pt-6 pb-6 md:pt-16 md:pb-16 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-50 text-secondary-700 text-sm font-medium mb-8 border border-secondary-100">
          <Wand2 size={16} />
          <span>{t('home:heroPill')}</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight mb-6">
          {t('home:heroTitlePart1')} <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">
            {t('home:heroTitlePart2')}
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 md:mb-12 leading-relaxed font-medium">
          {t('home:heroSubtitle')}
        </p>

        {/* Input Section - Responsive Layout */}
        <div className="w-full max-w-3xl mx-auto mt-4 md:mt-8">
           <form onSubmit={handleSave} className="flex flex-col gap-4">
              
              {/* Error Alert */}
              {error && (
                <div
                  className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm animate-fade-in"
                  style={{ animation: "fadeIn 0.3s ease-in, fadeOut 1s ease-out 14s forwards" }}
                >
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 text-left">
                    <p className="font-medium">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="text-red-600 hover:text-red-800 font-bold text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Input Wrapper (Glass Box) */}
              <div className="relative flex-1 group">
                <input 
                  type="text" 
                  placeholder={t('home:inputPlaceholder')} 
                  // ✅ FIXED: Added md:pr-[250px] so text doesn't hide under the desktop buttons!
                  className="w-full h-[60px] pl-6 pr-20 md:pr-[250px] text-lg bg-white/60 border border-white/50 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all outline-none text-gray-900 placeholder-gray-500 shadow-lg backdrop-blur-md relative z-0"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError("");
                  }}
                />
                
                {/* Clear URL (X) Button */}
                {url && !isLoading && (
                  <button
                    type="button"
                    onClick={handleClearUrl}
                    // ✅ FIXED: Using md:right-[210px] so it sits correctly to the left of the desktop buttons!
                    className="absolute right-[56px] md:right-[210px] top-1/2 -translate-y-1/2 text-red-500 hover:text-red-700 transition-colors z-20 p-2"
                    title="Clear URL"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}

                {/* Paste Button - Mobile (Modern Style) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 md:hidden z-10">
                  <button 
                     type="button"
                     onClick={handlePaste}
                     className="flex items-center justify-center w-[44px] h-[44px] bg-white/40 hover:bg-white/60 text-primary-900 rounded-xl transition-all border border-white/50 backdrop-blur-xl shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                     title="Paste Link"
                   >
                     <svg className="w-[20px] h-[20px]" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                       <path d="M24.89,6.61H22.31V4.47A2.47,2.47,0,0,0,19.84,2H6.78A2.47,2.47,0,0,0,4.31,4.47V22.92a2.47,2.47,0,0,0,2.47,2.47H9.69V27.2a2.8,2.8,0,0,0,2.8,2.8h12.4a2.8,2.8,0,0,0,2.8-2.8V9.41A2.8,2.8,0,0,0,24.89,6.61ZM6.78,23.52a.61.61,0,0,1-.61-.6V4.47a.61.61,0,0,1,.61-.6H19.84a.61.61,0,0,1,.61.6V6.61h-8a2.8,2.8,0,0,0-2.8,2.8V23.52Zm19,3.68a.94.94,0,0,1-.94.93H12.49a.94.94,0,0,1-.94-.93V9.41a.94.94,0,0,1,.94-.93h12.4a.94.94,0,0,1,.94.93Z"></path>
                       <path d="M23.49,13.53h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
                       <path d="M23.49,17.37h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
                       <path d="M23.49,21.22h-9.6a.93.93,0,1,0,0,1.86h9.6a.93.93,0,1,0,0-1.86Z"></path>
                     </svg>
                   </button>
                </div>

                {/* Buttons - Desktop (Modern Paste Style) */}
                <div className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-2 z-10">
                  <button 
                     type="button"
                     onClick={handlePaste}
                     className="flex items-center justify-center w-[44px] h-[44px] bg-white/40 hover:bg-white/60 text-primary-900 rounded-xl transition-all border border-white/50 backdrop-blur-xl shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                     title={t('home:pasteTitle')}
                   >
                     <svg className="w-[20px] h-[20px]" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                       <path d="M24.89,6.61H22.31V4.47A2.47,2.47,0,0,0,19.84,2H6.78A2.47,2.47,0,0,0,4.31,4.47V22.92a2.47,2.47,0,0,0,2.47,2.47H9.69V27.2a2.8,2.8,0,0,0,2.8,2.8h12.4a2.8,2.8,0,0,0,2.8-2.8V9.41A2.8,2.8,0,0,0,24.89,6.61ZM6.78,23.52a.61.61,0,0,1-.61-.6V4.47a.61.61,0,0,1,.61-.6H19.84a.61.61,0,0,1,.61.6V6.61h-8a2.8,2.8,0,0,0-2.8,2.8V23.52Zm19,3.68a.94.94,0,0,1-.94.93H12.49a.94.94,0,0,1-.94-.93V9.41a.94.94,0,0,1,.94-.93h12.4a.94.94,0,0,1,.94.93Z"></path>
                       <path d="M23.49,13.53h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
                       <path d="M23.49,17.37h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"></path>
                       <path d="M23.49,21.22h-9.6a.93.93,0,1,0,0,1.86h9.6a.93.93,0,1,0,0-1.86Z"></path>
                     </svg>
                   </button>
                   
                   <button 
                     type="submit"
                     disabled={!url.trim() || isLoading}
                     className="flex items-center gap-2 px-6 h-[44px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {isLoading ? (
                       <>
                         <Loader2 size={18} className="animate-spin" />
                         <span>{t('home:savingButton')}</span>
                       </>
                     ) : (
                       t('home:saveButton')
                     )}
                   </button>
                </div>
              </div>

              {/* Action Button - Mobile */}
              <button 
                type="submit"
                disabled={!url.trim() || isLoading}
                className="md:hidden h-[60px] px-10 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all text-lg shadow-xl shadow-primary-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={24} className="animate-spin" />
                    <span>{t('home:savingButton')}</span>
                  </>
                ) : (
                  t('home:saveButton')
                )}
              </button>
           </form>
        </div>

        <div className="flex items-center justify-center gap-8 text-sm text-gray-500 font-medium mt-10 md:mt-12">
          <div className="flex items-center gap-2">
            <span className="text-secondary-500 font-bold">✓</span> {t('home:check1')}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-secondary-500 font-bold">✓</span> {t('home:check2')}
          </div>
           <div className="flex items-center gap-2">
            <span className="text-secondary-500 font-bold">✓</span> {t('home:check3')}
          </div>
        </div>
      </div>

      {/* Features Grid - Glass Block Style */}
      <div className="w-full max-w-[1100px] px-5 py-10 md:px-8 md:py-16 glass-card rounded-3xl shadow-sm mb-6 md:mb-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-10 md:mb-16">{t('home:howItWorks')}</h2>
        
        <div className="grid md:grid-cols-3 gap-10 md:gap-12">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-white/50 rounded-full flex items-center justify-center text-primary-600 text-xl font-bold shadow-sm mb-4 md:mb-6 border border-white/60">1</div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">{t('home:step1Title')}</h3>
            <p className="text-gray-500 leading-relaxed text-sm md:text-base">{t('home:step1Desc')}</p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-white/50 rounded-full flex items-center justify-center text-primary-600 text-xl font-bold shadow-sm mb-4 md:mb-6 border border-white/60">2</div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">{t('home:step2Title')}</h3>
            <p className="text-gray-500 leading-relaxed text-sm md:text-base">{t('home:step2Desc')}</p>
          </div>
          <div className="text-center">
             <div className="w-16 h-16 mx-auto bg-white/50 rounded-full flex items-center justify-center text-primary-600 text-xl font-bold shadow-sm mb-4 md:mb-6 border border-white/60">3</div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">{t('home:step3Title')}</h3>
            <p className="text-gray-500 leading-relaxed text-sm md:text-base">{t('home:step3Desc')}</p>
          </div>
        </div>
      </div>

      {/* CTA - Increased spacing */}
      <div className="text-center mb-10 md:mb-18">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 md:mb-3">{t('home:ctaTitle')}</h2>
        <p className="text-gray-500 mb-4 md:mb-6 text-lg">{t('home:ctaDesc')}</p>
        <Button 
          onClick={() => navigate('/auth')} 
          size="lg" 
          className="px-8 py-4 text-lg gap-1 shadow-xl shadow-primary-600/20 bg-gray-900 hover:bg-black border-transparent group"
        >
          {t('home:signUpFree')} 
          <div className="flex items-center ml-1">
            {/* We stack them with negative margin so they look like one icon that expands */}
            <ChevronRight size={20} className="chevron-spread-1 animate-chevron-1" />
            <ChevronRight size={20} className="chevron-spread-2 animate-chevron-1 -ml-3" style={{ animationName: 'spread-mid' }} />
            <ChevronRight size={20} className="chevron-spread-3 animate-chevron-1 -ml-3" style={{ animationName: 'spread-end' }} />
          </div>
        </Button>
      </div>

      <style>{`
          @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
          }
          @keyframes subtle-side {
            0%, 100% { transform: translateX(0px); }
            50% { transform: translateX(5px); }
          }
          .animate-subtle-side {
            animation: subtle-side 1.5s ease-in-out infinite;
          }
        `}</style>
    </div>
  );
};