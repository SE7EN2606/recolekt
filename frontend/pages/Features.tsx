import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, 
  Layers, 
  Tags, 
  Search, 
  Wand2, 
  Smartphone, 
  Quote, 
  LayoutGrid, 
  Command, 
  Eye, 
  ChefHat, 
  ArrowDown,
  Clock,
  Users,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Button } from '../components/Button';

// Brand Icons
const TikTokIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.98-.23-2.81.31-.75.42-1.24 1.17-1.35 1.97-.08.76.11 1.57.54 2.2.44.67 1.18 1.15 1.97 1.28.85.14 1.73-.09 2.4-.62.59-.44.97-1.09 1.08-1.81.11-1.15.06-2.31.06-3.46 0-4.82-.01-9.65.01-14.47z"/>
  </svg>
);

const YouTubeIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const FacebookIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.791-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const FadeInOnScroll = ({ children, delay = 0, className = "" }: { children?: React.ReactNode, delay?: number, className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setTimeout(() => setIsVisible(true), delay); }, { threshold: 0.1 });
    if (ref.current) observer.observe(ref.current);
    return () => { if (ref.current) observer.unobserve(ref.current); };
  }, [delay]);
  return <div ref={ref} className={`transition-all duration-700 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'} ${className}`}>{children}</div>;
};

// Updated BentoBox to match Home block style: rounded-3xl, shadow-sm, optimized mobile padding (p-5)
const BentoBox = ({ children, className = "", title, subtitle, icon: Icon, dark = false, compact = false }: any) => (
  <div className={`relative overflow-hidden rounded-3xl p-5 md:p-8 group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${dark ? 'bg-dark-900 text-white shadow-xl shadow-dark-900/20' : 'bg-white text-gray-900 border border-gray-100 shadow-sm'} ${className} h-full`}>
    <div className="relative z-10 h-full flex flex-col">
      {/* Header with Title next to Icon */}
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-2xl flex-shrink-0 ${dark ? 'bg-white/10 text-white' : 'bg-gray-50 text-gray-900'}`}>
          {Icon && <Icon size={24} strokeWidth={2} />}
        </div>
        <h3 className={`text-xl md:text-2xl font-black tracking-tight leading-none ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
        {dark && <Sparkles size={16} className="text-primary-400 opacity-50 ml-auto" />}
      </div>
      
      <div className={compact ? "mb-4" : "mb-6"}>
        <p className={`font-medium leading-relaxed text-sm md:text-base ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{subtitle}</p>
      </div>

      {children && <div className="mt-auto">{children}</div>}
    </div>
    
    {/* Decor */}
    <div className={`absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-[80px] opacity-50 transition-opacity group-hover:opacity-70 ${dark ? 'bg-primary-600' : 'bg-gray-200'}`} />
  </div>
);

const DeepSearchMock = () => (
  <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
      <div className="relative mb-3">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
             <Search size={12} />
          </div>
          <div className="w-full bg-gray-50 border border-gray-100 rounded-lg py-2 pl-8 pr-3 text-[10px] font-medium text-gray-900 truncate">
             "vintage leather chair"
          </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50/50 border border-gray-50">
          <div className="w-8 h-10 bg-amber-800 rounded-md shadow-sm"></div>
          <div className="flex-1 min-w-0">
              <div className="h-1.5 w-16 bg-gray-200 rounded-full mb-1.5"></div>
              <div className="h-1.5 w-10 bg-gray-100 rounded-full"></div>
          </div>
          <div className="text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Match</div>
      </div>
  </div>
);

const AutoTagMock = () => (
  <div className="">
      <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-10 bg-gray-800 rounded-md shadow-sm relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/20 to-transparent"></div>
          </div>
          <div className="flex-1">
             <div className="flex items-center gap-1 text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                <Wand2 size={10} className="text-purple-500" /> AI Analysis
             </div>
             <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 w-2/3 animate-pulse"></div>
             </div>
          </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-1 bg-white border border-gray-100 text-gray-600 rounded-md text-[9px] font-bold shadow-sm">#Fitness</span>
          <span className="px-2 py-1 bg-purple-50 border border-purple-100 text-purple-700 rounded-md text-[9px] font-bold shadow-sm">#HIIT</span>
          <span className="px-2 py-1 bg-white border border-gray-100 text-gray-600 rounded-md text-[9px] font-bold shadow-sm">#Gym</span>
      </div>
  </div>
);

export const Features: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-[#f8fafc] overflow-x-hidden selection:bg-primary-900 selection:text-white font-sans">
        
        {/* HERO: The Promise */}
        <section className="relative pt-10 pb-8 md:pt-32 md:pb-24 text-center">
            <div className="max-w-4xl mx-auto relative z-10">
                <FadeInOnScroll>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] mb-8 shadow-xl shadow-dark-900/20 rotate-1 hover:rotate-0 transition-transform cursor-default">
                        <Zap size={14} className="text-yellow-400 fill-current" />
                        <span>For Creators & Curators</span>
                    </div>
                  <h1 className="text-5xl md:text-8xl font-black text-gray-900 tracking-tight mb-8 leading-[0.9] md:leading-[0.9]">
                      Turn your doomscrolling into a <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">database.</span>
                  </h1>

                    <p className="text-xl md:text-2xl text-gray-500 max-w-2xl mx-auto mb-12 font-bold leading-tight tracking-tight">
                       The first "Read-it-Later" app built specifically for the chaos of short-form video.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                      <Button onClick={() => navigate('/auth')} size="lg" className="h-16 px-10 text-lg rounded-2xl shadow-xl shadow-primary-600/30">
                        Start Curating Free
                      </Button>
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-4 sm:mt-0 sm:ml-4">
                        Works with IG, TikTok & Shorts
                      </p>
                    </div>
                </FadeInOnScroll>
            </div>
        </section>

        {/* FEATURE GRID: The Bento Box */}
        <section className="py-8 md:py-12">
            <div className="max-w-[1100px] mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Row 1 */}
                    
                    {/* 1. AI Extraction - FULL WIDTH */}
                    <FadeInOnScroll className="md:col-span-3 h-full">
                        <BentoBox 
                          title="Smart Metadata" 
                          subtitle="We extract the important stuff so you don't have to."
                          icon={ChefHat}
                          className="bg-gradient-to-br from-gray-900 to-gray-800 text-white"
                          dark
                        >
                          <div className="mt-8 relative z-20 flex justify-center w-full">
                            <img 
                              src="https://raw.githubusercontent.com/SE7EN2606/recolekt/1424ad9f3f10f09ec8533759f2d6c2e97ec6a4e5/frontend/assets/760shots_so.png" 
                              alt="Smart Metadata Interface"
                              className="w-full h-auto rounded-xl shadow-2xl border border-gray-700/50"
                            />
                          </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* Row 2 */}

                    {/* 2. Platform Agnostic */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title="Any Platform" 
                          subtitle="One home for all your feeds."
                          icon={LayoutGrid}
                          compact={false}
                        >
                           <div className="mt-8 grid grid-cols-2 gap-4 h-full items-center justify-center p-2">
                              {/* Instagram - Active */}
                              <div className="aspect-square bg-white rounded-2xl shadow-lg transform hover:scale-105 transition-all flex items-center justify-center border border-gray-50 overflow-hidden relative">
                                <img 
                                  src="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg"
                                  alt="Instagram"
                                  className="w-16 h-16"
                                />
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-50 border border-green-500 text-green-700 text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">
                                  LIVE
                                </div>
                              </div>

                              {/* TikTok - Disabled */}
                              <div className="aspect-square bg-gray-50 border border-gray-100 rounded-2xl flex flex-col items-center justify-center relative group">
                                  <TikTokIcon className="w-12 h-12 text-gray-400 group-hover:text-black transition-colors z-20" />
                                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100/80 backdrop-blur-sm border border-yellow-300 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>

                               {/* YouTube - Disabled */}
                              <div className="aspect-square bg-gray-50 border border-gray-100 rounded-2xl flex flex-col items-center justify-center relative group">
                                  <YouTubeIcon className="w-12 h-12 text-gray-400 group-hover:text-[#FF0000] transition-colors z-20" />
                                   <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100/80 backdrop-blur-sm border border-yellow-300 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>

                               {/* Facebook - Disabled */}
                              <div className="aspect-square bg-gray-50 border border-gray-100 rounded-2xl flex flex-col items-center justify-center relative group">
                                  <FacebookIcon className="w-12 h-12 text-gray-400 group-hover:text-[#1877F2] transition-colors z-20" />
                                   <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100/80 backdrop-blur-sm border border-yellow-300 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>
                           </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* 3. Deep Search (1 Col) */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title="Visual Intelligence" 
                          subtitle="Search for specific moments visually."
                          icon={Search}
                          compact={true}
                        >
                            <div className="mt-6">
                                <DeepSearchMock />
                            </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* 4. Smart Tags (1 Col) */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title="Zero-Touch Sorting" 
                          subtitle="Our AI identifies the niche instantly."
                          icon={Tags}
                          compact={true}
                        >
                            <div className="mt-6">
                                <AutoTagMock />
                            </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* Row 3 */}

                    {/* 5. Collections - FULL WIDTH */}
                    <FadeInOnScroll className="md:col-span-3 h-full">
                        <BentoBox 
                          title="Purpose-Built" 
                          subtitle="Organize your chaos into beautiful collections."
                          icon={Layers}
                          compact={true}
                        >
                           <div className="flex flex-wrap gap-3 mt-6">
                              <div className="px-4 py-3 bg-orange-50 text-orange-700 rounded-xl font-bold text-sm flex items-center gap-2">
                                🍳 Dinner Ideas
                              </div>
                              <div className="px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm flex items-center gap-2">
                                🏋️‍♀️ Leg Day
                              </div>
                              <div className="px-4 py-3 bg-green-50 text-green-700 rounded-xl font-bold text-sm flex items-center gap-2">
                                🌿 Home Decor
                              </div>
                              <div className="px-4 py-3 bg-purple-50 text-purple-700 rounded-xl font-bold text-sm flex items-center gap-2">
                                ✈️ Travel Inspo
                              </div>
                              <div className="px-4 py-3 bg-pink-50 text-pink-700 rounded-xl font-bold text-sm flex items-center gap-2">
                                💅 Beauty Hacks
                              </div>
                           </div>
                        </BentoBox>
                    </FadeInOnScroll>

                </div>
            </div>
        </section>

        {/* COMPARISON */}
        <section className="py-16 md:py-24 px-4 bg-white border-y border-gray-100">
             <div className="max-w-4xl mx-auto">
                {/* The Old Way */}
                <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
                    <div>
                        <div className="inline-block px-3 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] mb-6">
                            The Old Way
                        </div>
                        <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-6">RIP Screenshots.</h2>
                        <p className="text-lg text-gray-500 font-medium leading-relaxed mb-8">
                            Stop filling your camera roll with static images of dynamic content. Screenshots capture zero context, no audio, and no links. They are dead pixels.
                        </p>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-tr from-red-500/20 to-transparent rounded-[40px] blur-3xl" />
                        <div className="relative bg-dark-900 rounded-[40px] p-8 text-center border border-gray-800 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500 h-[320px] flex flex-col items-center justify-center">
                           <div className="text-6xl mb-4">💀</div>
                           <h3 className="text-white font-black text-2xl mb-2">Camera Roll Graveyard</h3>
                           <p className="text-gray-500 text-sm">3,492 items • 12GB used</p>
                        </div>
                    </div>
                </div>

                {/* Arrow Divider */}
                <div className="flex justify-center mb-24">
                   <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-full flex items-center justify-center animate-bounce">
                     <ArrowDown size={24} />
                   </div>
                </div>

                {/* The Recolekt Way */}
                <div className="relative overflow-hidden rounded-[40px] bg-[#0B0F19] border border-gray-800 p-8 md:p-16 text-center shadow-2xl">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary-600/20 blur-[120px] rounded-full pointer-events-none" />
                    
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-900/30 border border-primary-500/30 text-primary-300 text-[10px] font-black uppercase tracking-[0.2em] mb-8 shadow-[0_0_20px_rgba(124,58,237,0.1)]">
                            <Sparkles size={12} />
                            <span>The Recolekt Way</span>
                        </div>
                        
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 leading-tight">
                            You collect. <br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-secondary-500">We recollect.</span>
                        </h2>
                        
                        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-16 leading-relaxed font-medium">
                            Transform your passive consumption into an active asset library. Organized, searchable, and always ready when you need it.
                        </p>
                        
                        <div className="grid md:grid-cols-3 gap-6">
                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-primary-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <CheckCircle2 className="w-6 h-6 text-primary-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">Live & Active</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">Links stay clickable. Jump back to the original context instantly.</p>
                              </div>
                           </div>

                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <RefreshCw className="w-6 h-6 text-blue-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">Always Fresh</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">Auto-updates if the creator edits the caption or metrics.</p>
                              </div>
                           </div>

                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-secondary-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <Search className="w-6 h-6 text-secondary-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">Instant Find</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">Search by color, object, transcript, or even visual mood.</p>
                              </div>
                           </div>
                        </div>
                    </div>
                </div>
             </div>
        </section>

        {/* USE CASES */}
        <section className="py-24 px-4 bg-dark-900 text-white">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                     <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-6">The Curator's Toolkit</h2>
                     <p className="text-gray-400 font-medium text-lg">Essential for modern creative workflows.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Wand2 size={24} />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold mb-2">Social Media Managers</h3>
                           <p className="text-gray-400 text-sm leading-relaxed">
                               Build competitor analysis boards and trend reports without clogging your personal feed.
                           </p>
                        </div>
                    </div>
                    
                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Command size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-2">Designers & Directors</h3>
                          <p className="text-gray-400 text-sm leading-relaxed">
                              Create dynamic moodboards that actually play video. Reference motion graphics and transitions instantly.
                          </p>
                        </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-secondary-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Smartphone size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-2">UGC Creators</h3>
                          <p className="text-gray-400 text-sm leading-relaxed">
                              Save hook ideas, audio trends, and editing tricks. Add notes on how you'll remix them.
                          </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* TESTIMONIAL */}
        <section className="py-16 md:py-24 px-4">
             <div className="max-w-3xl mx-auto text-center">
                 <Quote size={48} className="mx-auto text-primary-200 mb-8" fill="currentColor" />
                 <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-8">
                    "I used to have 5,000 screenshots in my 'Inspo' album. Recolekt actually lets me find the video I saved 6 months ago by searching for 'green dress'."
                 </h2>
                 <div className="flex items-center justify-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div className="text-left">
                        <div className="font-bold text-gray-900">Casey N.</div>
                        <div className="text-xs font-black text-gray-400 uppercase tracking-widest">Creative Director</div>
                    </div>
                 </div>
             </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-24 px-4 bg-gradient-to-br from-primary-600 to-indigo-800 text-white text-center rounded-t-[60px]">
            <div className="max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 shadow-sm">
                    <Eye size={12} />
                    <span>Focus Mode</span>
                </div>
                <h2 className="text-5xl md:text-7xl font-black tracking-tight mb-8">
                    Stop Saving.<br/>Start Building.
                </h2>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button 
                        onClick={() => navigate('/auth')}
                        size="xl"
                        className="gap-2 shadow-xl shadow-primary-600/20 bg-white text-primary-900 hover:bg-gray-50 font-black rounded-xl"
                    >
                        Launch App <ArrowRight size={20} />
                    </Button>
                </div>
                <p className="mt-8 text-white/40 text-xs font-bold uppercase tracking-widest">
                    Free forever for personal use. No credit card.
                </p>
            </div>
        </section>

    </div>
  );
};
