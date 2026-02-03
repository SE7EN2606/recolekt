import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wand2, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';

export const Home: React.FC = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingUrl, setPendingUrl] = useState('');
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_BASE; // Utilise uniquement la variable d'environnement

  // Auto-dismiss error after 15 seconds with fade out
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Check if user just logged in/verified and has a pending URL to save
  useEffect(() => {
    const checkPendingVideo = async () => {
      const storedPendingUrl = localStorage.getItem('pendingVideoUrl');
      
      if (storedPendingUrl) {
        try {
          const authResponse = await fetch(`${API_BASE}/api/auth/me`, {
            credentials: 'include'
          });

          // ✅ Check for 401 before processing
          if (authResponse.status === 401) {
            return; // User not authenticated, do nothing
          }

          const authData = await authResponse.json();

          if (authData.authenticated) {
            // User is now authenticated, process the pending video
            localStorage.removeItem('pendingVideoUrl');
            setUrl(storedPendingUrl);
            setPendingUrl('');
            
            // Automatically trigger save logic
            setTimeout(() => {
              handleSaveWithUrl(storedPendingUrl);
            }, 500);
          }
        } catch (err) {
          console.error('Error checking auth status:', err);
        }
      }
    };

    checkPendingVideo();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError('');
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleClearUrl = () => {
    setUrl('');
    setError('');
    setPendingUrl('');
  };

  const handleSaveWithUrl = async (urlToSave: string) => {
    if (!urlToSave.trim() || isLoading) return;
    
    setIsLoading(true);
    setError('');

    const cleanUrl = urlToSave.split('?')[0];

    try {
      const formData = new FormData();
      formData.append('url', cleanUrl);

      const response = await fetch(`${API_BASE}/api/summarize`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      // ✅ CRITICAL: Authentication Check
      // If 401, stop everything, save URL, and send to login.
      if (response.status === 401) {
        localStorage.setItem('pendingVideoUrl', cleanUrl);
        navigate('/auth');
        return; 
      }

      // Read response only if authenticated
      const data = await response.json();

      // Handle Plan Limits / Verification
      if (response.status === 403) {
        if (data.code === 'VERIFICATION_REQUIRED') {
          localStorage.setItem('pendingVideoUrl', cleanUrl);
          setPendingUrl(cleanUrl);
          setError('Please verify your account to save videos. Check your email for verification link.');
          setIsLoading(false);
          return;
        }
        // Handle other 403s (like plan limits)
        setError(data.error || 'Limit reached.');
        setIsLoading(false);
        return;
      }

      // Handle Duplicates
      if (response.status === 409) {
        setError(data.error || 'This video has already been saved to your collection.');
        setUrl('');
        setIsLoading(false);
        return;
      }

      // Handle Generic Errors
      if (!response.ok) {
        console.error('Backend error:', data);
        setError(data.error || 'Failed to import this URL. Please try again.');
        setIsLoading(false);
        return;
      }

      // ✅ SUCCESS: Optimistic Update
      // Create a temp record to show immediately in the gallery
      const client_temp_id = `temp_${Date.now()}`;
      
      const realRecord = {
        process_id: data.reel_id,
        status: data.status || 'processing',
        folder_id: 'default',
        source_url: cleanUrl,
        created_at: new Date().toISOString(),
        summary: { title: 'Processing…' },
        gcs_urls: {
          preview_thumbnail: data.preview_url || null,
          thumbnail: null,
        },
        client_temp_id,
      };

      // Update local storage for instant gallery feedback
      const existing = JSON.parse(localStorage.getItem('savedReels') || '[]');
      localStorage.setItem('savedReels', JSON.stringify([realRecord, ...existing]));

      // ✅ REDIRECT: Go to gallery immediately
      navigate(`/gallery?new=${client_temp_id}&url=${encodeURIComponent(cleanUrl)}`);

    } catch (err) {
      console.error('Failed to save video:', err);
      setError('Network error. Please check your connection and try again.');
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    handleSaveWithUrl(url);
  };

  // Paste SVG Icon Component
  const PasteIcon = ({ className = "" }: { className?: string }) => (
    <svg 
      className={className}
      viewBox="0 0 32 32" 
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M24.89,6.61H22.31V4.47A2.47,2.47,0,0,0,19.84,2H6.78A2.47,2.47,0,0,0,4.31,4.47V22.92a2.47,2.47,0,0,0,2.47,2.47H9.69V27.2a2.8,2.8,0,0,0,2.8,2.8h12.4a2.8,2.8,0,0,0,2.8-2.8V9.41A2.8,2.8,0,0,0,24.89,6.61ZM6.78,23.52a.61.61,0,0,1-.61-.6V4.47a.61.61,0,0,1,.61-.6H19.84a.61.61,0,0,1,.61.6V6.61h-8a2.8,2.8,0,0,0-2.8,2.8V23.52Zm19,3.68a.94.94,0,0,1-.94.93H12.49a.94.94,0,0,1-.94-.93V9.41a.94.94,0,0,1,.94-.93h12.4a.94.94,0,0,1,.94.93Z"/>
      <path d="M23.49,13.53h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"/>
      <path d="M23.49,17.37h-9.6a.94.94,0,1,0,0,1.87h9.6a.94.94,0,1,0,0-1.87Z"/>
      <path d="M23.49,21.22h-9.6a.93.93,0,1,0,0,1.86h9.6a.93.93,0,1,0,0-1.86Z"/>
    </svg>
  );

  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <div className="w-full max-w-4xl mx-auto pt-8 md:pt-0 pb-8 md:pb-12 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm md:text-base font-medium mb-8 md:mb-8 animate-fade-in">
          <Wand2 size={16} className="md:w-5 md:h-5" />
          <span>Save & Organize Short Videos</span>
        </div>
        
        <h1 className="text-4xl md:text-7xl font-bold text-gray-900 tracking-tight mb-6">
          Your Personal <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">Video Library</span>
        </h1>
        
        <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto mb-8 md:mb-12 leading-relaxed">
          Save Instagram Reels, organize them into collections, and let AI help you categorize what matters most.
        </p>

        {/* Input Section */}
        <div className="w-full max-w-3xl mx-auto mt-8">
          <div className="flex flex-col gap-4">
            {/* ERROR ALERT */}
            {error && (
              <div 
                className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm animate-fade-in"
                style={{
                  animation: 'fadeIn 0.3s ease-in, fadeOut 1s ease-out 14s forwards'
                }}
              >
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-left">
                  <p className="font-medium">{error}</p>
                </div>
                <button 
                  onClick={() => setError('')}
                  className="text-red-600 hover:text-red-800 font-bold text-xl leading-none"
                >
                  ×
                </button>
              </div>
            )}

            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="Insert instagram link here" 
                className="w-full h-[50px] md:h-[60px] pl-4 md:pl-6 pr-16 md:pr-52 text-sm md:text-lg bg-white border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all outline-none text-gray-900 placeholder-gray-500 shadow-sm relative z-0"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                }}
              />
              
              {/* Clear URL Button */}
              {url && !isLoading && (
                <button 
                  type="button"
                  onClick={handleClearUrl}
                  className="absolute right-12 md:right-[180px] top-1/2 -translate-y-1/2 text-red-500 hover:text-red-700 transition-colors z-10 p-1"
                  title="Clear URL"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}

              {/* Paste Button - Mobile */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 md:hidden z-10">
                <button 
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center justify-center w-[36px] h-[36px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all border border-gray-200"
                  title="Paste from clipboard"
                >
                  <PasteIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Desktop Buttons */}
              <div className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-2 z-10">
                <button 
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center justify-center w-[44px] h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all border border-gray-200"
                  title="Paste from clipboard"
                >
                  <PasteIcon className="w-[18px] h-[18px]" />
                </button>
                
                <button 
                  onClick={handleSave}
                  disabled={!url.trim() || isLoading}
                  className="w-[110px] h-[44px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition-all text-sm shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Save Button */}
            <button 
              onClick={handleSave}
              disabled={!url.trim() || isLoading}
              className="md:hidden w-full h-[50px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all text-base shadow-xl shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>

        {/* Checkmarks */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-xs md:text-base text-gray-500 font-medium mt-10 md:mt-14 mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Public videos only
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Privacy respected
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Fast & reliable
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="w-full max-w-[1100px] px-4 md:px-8 py-8 md:py-16 bg-white border border-gray-100 rounded-3xl shadow-sm mb-12 md:mb-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-8 md:mb-16">How It Works</h2>
        
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          <div className="text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-sm md:text-base font-bold shadow-lg shadow-primary-600/30 mb-4 md:mb-6">
              1
            </div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">Paste Link</h3>
            <p className="text-sm md:text-base text-gray-500 leading-relaxed">
              Share any public Instagram Reel URL
            </p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-sm md:text-base font-bold shadow-lg shadow-primary-600/30 mb-4 md:mb-6">
              2
            </div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">Auto-Organize</h3>
            <p className="text-sm md:text-base text-gray-500 leading-relaxed">
              Our AI categorizes and extracts key information
            </p>
          </div>

          <div className="text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-sm md:text-base font-bold shadow-lg shadow-primary-600/30 mb-4 md:mb-6">
              3
            </div>
            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 md:mb-3">Explore & Share</h3>
            <p className="text-sm md:text-base text-gray-500 leading-relaxed">
              Browse your collection and discover similar content
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="text-center mb-16 md:mb-20 px-4">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 md:mb-6">Ready to get started?</h2>
        <p className="text-sm md:text-lg text-gray-500 mb-6 md:mb-8">Scroll up to save your first Instagram Reel or explore our gallery</p>
        <Button onClick={() => navigate('/gallery')} size="lg" className="px-6 md:px-8 py-3 md:py-4 text-base md:text-lg gap-2 shadow-xl shadow-primary-600/20">
          View Gallery <ArrowRight size={18} className="md:w-5 md:h-5" />
        </Button>
      </div>

      <style>{`
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>
    </div>
  );
};
