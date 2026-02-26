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
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Button } from '../components/Button';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT DE LA TRADUCTION

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

// Adapted BentoBox to use glass styling instead of solid white
const BentoBox = ({ children, className = "", title, subtitle, icon: Icon, dark = false, compact = false }: any) => (
  <div className={`relative overflow-hidden rounded-3xl p-5 md:p-8 group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${dark ? 'bg-dark-900 text-white shadow-xl shadow-dark-900/20' : 'bg-white/60 backdrop-blur-xl border border-white/40 text-gray-900 shadow-sm'} ${className} h-full`}>
    <div className="relative z-10 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-2xl flex-shrink-0 ${dark ? 'bg-white/10 text-white' : 'bg-white/80 shadow-sm text-primary-600'}`}>
          {Icon && <Icon size={24} strokeWidth={2} />}
        </div>
        <h3 className={`text-xl md:text-2xl font-black tracking-tight leading-none ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
        {dark && <Sparkles size={16} className="text-primary-400 opacity-50 ml-auto" />}
      </div>
      
      <div className={compact ? "mb-4" : "mb-6"}>
        <p className={`font-medium leading-relaxed text-sm md:text-base ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{subtitle}</p>
      </div>

      {children && <div className="mt-auto">{children}</div>}
    </div>
    
    <div className={`absolute -right-10 -bottom-10 w-40 h-40 rounded-full blur-[80px] opacity-50 transition-opacity group-hover:opacity-70 ${dark ? 'bg-primary-600' : 'bg-primary-200'}`} />
  </div>
);

const DeepSearchMock = () => (
  <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-white/40 shadow-sm">
      <div className="relative mb-3">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
             <Search size={12} />
          </div>
          <div className="w-full bg-white/80 border border-white/40 rounded-lg py-2 pl-8 pr-3 text-[10px] font-medium text-gray-900 truncate shadow-inner">
             "vintage leather chair"
          </div>
      </div>
      <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50 border border-white/20">
          <div className="w-8 h-10 bg-amber-800 rounded-md shadow-sm"></div>
          <div className="flex-1 min-w-0">
              <div className="h-1.5 w-16 bg-gray-200/80 rounded-full mb-1.5"></div>
              <div className="h-1.5 w-10 bg-gray-100/80 rounded-full"></div>
          </div>
          <div className="text-[9px] font-bold text-green-600 bg-green-50/80 px-1.5 py-0.5 rounded border border-green-100/50">Match</div>
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
             <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">
                <Wand2 size={10} className="text-purple-500" /> AI Analysis
             </div>
             <div className="h-1 w-full bg-white/50 rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-purple-500 w-2/3 animate-pulse"></div>
             </div>
          </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
          <span className="px-2 py-1 bg-white/80 border border-white/40 text-gray-600 rounded-md text-[9px] font-bold shadow-sm backdrop-blur-sm">#Fitness</span>
          <span className="px-2 py-1 bg-purple-50/80 border border-purple-100 text-purple-700 rounded-md text-[9px] font-bold shadow-sm backdrop-blur-sm">#HIIT</span>
          <span className="px-2 py-1 bg-white/80 border border-white/40 text-gray-600 rounded-md text-[9px] font-bold shadow-sm backdrop-blur-sm">#Gym</span>
      </div>
  </div>
);

export const Features: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['features']); // 🔥 HOOK DE TRADUCTION

  return (
    <div className="overflow-x-hidden font-sans pb-12">
        
        {/* HERO: Adjusted padding to pt-4 as requested */}
        <section className="relative pt-4 pb-8 md:pb-24 text-center">
            <div className="max-w-4xl mx-auto relative z-10">
                <FadeInOnScroll>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] mb-8 shadow-xl shadow-dark-900/20 rotate-1 hover:rotate-0 transition-transform cursor-default">
                        <Zap size={14} className="text-yellow-400 fill-current" />
                        <span>{t('features:pill')}</span>
                    </div>
                  
                  {/* Titre : Nous divisons la traduction en deux pour gérer le dégradé sur le dernier mot si nécessaire, 
                      ou nous remplaçons le mot en dur. Dans le JSON, j'ai tout mis dans "heroTitle". */}
                  <h1 className="text-5xl md:text-8xl font-black text-gray-900 tracking-tight mb-8 leading-[0.9] md:leading-[0.9]">
                      {t('features:heroTitle').split(" ").slice(0, -2).join(" ")} <br/>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">
                        {t('features:heroTitle').split(" ").slice(-2).join(" ")}
                      </span>
                  </h1>

                    <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto mb-12 font-bold leading-tight tracking-tight">
                       {t('features:heroSubtitle')}
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                      <Button onClick={() => navigate('/auth')} size="lg" className="h-16 px-10 text-lg rounded-2xl shadow-xl shadow-primary-600/30">
                        {t('features:ctaButton')}
                      </Button>
                      <p className="text-xs font-black text-gray-500 uppercase tracking-widest mt-4 sm:mt-0 sm:ml-4">
                        {t('features:worksWith')}
                      </p>
                    </div>
                </FadeInOnScroll>
            </div>
        </section>

        {/* FEATURE GRID */}
        <section className="py-8 md:py-12">
            <div className="max-w-[1100px] mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* 1. AI Extraction - FULL WIDTH */}
                    <FadeInOnScroll className="md:col-span-3 h-full">
                        <BentoBox 
                          title={t('features:bento1Title')} 
                          subtitle={t('features:bento1Sub')}
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

                    {/* 2. Platform Agnostic */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title={t('features:bento2Title')} 
                          subtitle={t('features:bento2Sub')}
                          icon={LayoutGrid}
                          compact={false}
                        >
                           <div className="mt-8 grid grid-cols-2 gap-4 h-full items-center justify-center p-2">
                              {/* Instagram */}
                              <div className="aspect-square bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm transform hover:scale-105 transition-all flex items-center justify-center border border-white/60 overflow-hidden relative">
                                <img 
                                  src="https://upload.wikimedia.org/wikipedia/commons/e/e7/Instagram_logo_2016.svg"
                                  alt="Instagram"
                                  className="w-16 h-16"
                                />
                                <div className="absolute top-2 right-2 px-2 py-0.5 bg-green-50/90 border border-green-200 text-green-700 text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">
                                  LIVE
                                </div>
                              </div>

                              {/* TikTok */}
                              <div className="aspect-square bg-white/40 border border-white/40 rounded-2xl flex flex-col items-center justify-center relative group backdrop-blur-sm">
                                  <TikTokIcon className="w-12 h-12 text-gray-400 group-hover:text-black transition-colors z-20" />
                                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-50/90 border border-yellow-200 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>

                               {/* YouTube */}
                              <div className="aspect-square bg-white/40 border border-white/40 rounded-2xl flex flex-col items-center justify-center relative group backdrop-blur-sm">
                                  <YouTubeIcon className="w-12 h-12 text-gray-400 group-hover:text-[#FF0000] transition-colors z-20" />
                                   <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-50/90 border border-yellow-200 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>

                               {/* Facebook */}
                              <div className="aspect-square bg-white/40 border border-white/40 rounded-2xl flex flex-col items-center justify-center relative group backdrop-blur-sm">
                                  <FacebookIcon className="w-12 h-12 text-gray-400 group-hover:text-[#1877F2] transition-colors z-20" />
                                   <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-50/90 border border-yellow-200 text-yellow-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                                    SOON
                                  </div>
                              </div>
                           </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* 3. Deep Search */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title={t('features:bento3Title')} 
                          subtitle={t('features:bento3Sub')}
                          icon={Search}
                          compact={true}
                        >
                            <div className="mt-6">
                                <DeepSearchMock />
                            </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* 4. Smart Tags */}
                    <FadeInOnScroll className="md:col-span-1 h-full">
                        <BentoBox 
                          title={t('features:bento4Title')} 
                          subtitle={t('features:bento4Sub')}
                          icon={Tags}
                          compact={true}
                        >
                            <div className="mt-6">
                                <AutoTagMock />
                            </div>
                        </BentoBox>
                    </FadeInOnScroll>

                    {/* 5. Collections */}
                    <FadeInOnScroll className="md:col-span-3 h-full">
                        <BentoBox 
                          title={t('features:bento5Title')} 
                          subtitle={t('features:bento5Sub')}
                          icon={Layers}
                          compact={true}
                        >
                           <div className="flex flex-wrap gap-3 mt-6">
                              <div className="px-4 py-3 bg-orange-50/80 border border-orange-100 backdrop-blur-sm text-orange-700 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm">
                                🍳 Dinner Ideas
                              </div>
                              <div className="px-4 py-3 bg-blue-50/80 border border-blue-100 backdrop-blur-sm text-blue-700 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm">
                                🏋️‍♀️ Leg Day
                              </div>
                              <div className="px-4 py-3 bg-green-50/80 border border-green-100 backdrop-blur-sm text-green-700 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm">
                                🌿 Home Decor
                              </div>
                              <div className="px-4 py-3 bg-purple-50/80 border border-purple-100 backdrop-blur-sm text-purple-700 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm">
                                ✈️ Travel Inspo
                              </div>
                              <div className="px-4 py-3 bg-pink-50/80 border border-pink-100 backdrop-blur-sm text-pink-700 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm">
                                💅 Beauty Hacks
                              </div>
                           </div>
                        </BentoBox>
                    </FadeInOnScroll>

                </div>
            </div>
        </section>

        {/* COMPARISON */}
        <section className="py-16 md:py-24 px-4 bg-white/40 backdrop-blur-3xl border-y border-white/50 shadow-sm mt-12 mb-12">
             <div className="max-w-4xl mx-auto">
                <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
                    <div>
                        <div className="inline-block px-3 py-1 bg-red-50/80 border border-red-100 backdrop-blur-sm text-red-500 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] mb-6 shadow-sm">
                            {t('features:oldWay')}
                        </div>
                        <h2 className="text-4xl font-black text-gray-900 tracking-tight mb-6">{t('features:oldTitle')}</h2>
                        <p className="text-lg text-gray-600 font-medium leading-relaxed mb-8">
                            {t('features:oldDesc')}
                        </p>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-tr from-red-500/20 to-transparent rounded-[40px] blur-3xl" />
                        <div className="relative bg-dark-900 rounded-[40px] p-8 text-center border border-gray-800 shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-500 h-[320px] flex flex-col items-center justify-center">
                           <div className="text-6xl mb-4">💀</div>
                           <h3 className="text-white font-black text-2xl mb-2">{t('features:oldGrave')}</h3>
                           <p className="text-gray-500 text-sm">3,492 items • 12GB used</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center mb-24">
                   <div className="w-12 h-12 bg-white/80 backdrop-blur-sm shadow-sm border border-white text-primary-600 rounded-full flex items-center justify-center animate-bounce">
                     <ArrowDown size={24} />
                   </div>
                </div>

                <div className="relative overflow-hidden rounded-[40px] bg-[#0B0F19] border border-gray-800 p-8 md:p-16 text-center shadow-2xl">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-primary-600/20 blur-[120px] rounded-full pointer-events-none" />
                    
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-900/30 border border-primary-500/30 text-primary-300 text-[10px] font-black uppercase tracking-[0.2em] mb-8 shadow-[0_0_20px_rgba(124,58,237,0.1)]">
                            <Sparkles size={12} />
                            <span>{t('features:newWay')}</span>
                        </div>
                        
                        <h2 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 leading-tight">
                            {t('features:newTitle1')} <br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-secondary-500">{t('features:newTitle2')}</span>
                        </h2>
                        
                        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-16 leading-relaxed font-medium">
                            {t('features:newDesc')}
                        </p>
                        
                        <div className="grid md:grid-cols-3 gap-6">
                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-primary-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <CheckCircle2 className="w-6 h-6 text-primary-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">{t('features:featLive')}</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">{t('features:featLiveDesc')}</p>
                              </div>
                           </div>

                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <RefreshCw className="w-6 h-6 text-blue-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">{t('features:featFresh')}</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">{t('features:featFreshDesc')}</p>
                              </div>
                           </div>

                           <div className="bg-white/5 backdrop-blur-sm p-8 rounded-3xl border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all group flex flex-row items-start gap-4 text-left">
                              <div className="w-12 h-12 bg-secondary-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                 <Search className="w-6 h-6 text-secondary-400" />
                              </div>
                              <div>
                                <h4 className="font-bold text-xl text-white mb-2">{t('features:featInstant')}</h4>
                                <p className="text-gray-400 text-sm leading-relaxed">{t('features:featInstantDesc')}</p>
                              </div>
                           </div>
                        </div>
                    </div>
                </div>
             </div>
        </section>

        {/* USE CASES */}
        <section className="py-24 px-4 bg-dark-900 text-white rounded-[40px] mx-4 shadow-2xl mb-12">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-16">
                     <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-6">{t('features:toolkitTitle')}</h2>
                     <p className="text-gray-400 font-medium text-lg">{t('features:toolkitSub')}</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-primary-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Wand2 size={24} />
                        </div>
                        <div>
                           <h3 className="text-xl font-bold mb-2">{t('features:role1')}</h3>
                           <p className="text-gray-400 text-sm leading-relaxed">
                               {t('features:role1Desc')}
                           </p>
                        </div>
                    </div>
                    
                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Command size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-2">{t('features:role2')}</h3>
                          <p className="text-gray-400 text-sm leading-relaxed">
                              {t('features:role2Desc')}
                          </p>
                        </div>
                    </div>

                    <div className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex flex-row items-start gap-4">
                        <div className="w-12 h-12 bg-secondary-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Smartphone size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-2">{t('features:role3')}</h3>
                          <p className="text-gray-400 text-sm leading-relaxed">
                              {t('features:role3Desc')}
                          </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* TESTIMONIAL */}
        <section className="py-16 md:py-24 px-4 bg-white/40 backdrop-blur-3xl border-y border-white/50 shadow-sm mb-12">
             <div className="max-w-3xl mx-auto text-center">
                 <Quote size={48} className="mx-auto text-primary-300 mb-8" fill="currentColor" />
                 <h2 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight mb-8">
                    {t('features:testimonial')}
                 </h2>
                 <div className="flex items-center justify-center gap-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-full" />
                    <div className="text-left">
                        <div className="font-bold text-gray-900">Casey N.</div>
                        <div className="text-xs font-black text-gray-500 uppercase tracking-widest">Creative Director</div>
                    </div>
                 </div>
             </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-24 px-4 bg-gradient-to-br from-primary-600 to-indigo-800 text-white text-center rounded-[60px] mx-4 shadow-2xl">
            <div className="max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-8 shadow-sm">
                    <Eye size={12} />
                    <span>Focus Mode</span>
                </div>
                {/* Pareil pour ce titre de fin, si on veut diviser en 2 lignes selon la traduction : */}
                <h2 className="text-5xl md:text-7xl font-black tracking-tight mb-8">
                    {t('features:finalCTA').split(".")[0]}.<br/>
                    {t('features:finalCTA').split(".")[1]}.
                </h2>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <Button 
                        onClick={() => navigate('/auth')}
                        size="xl"
                        className="gap-2 shadow-xl shadow-primary-600/20 bg-white text-primary-900 hover:bg-gray-50 font-black rounded-xl"
                    >
                        {t('features:launchApp')} <ArrowRight size={20} />
                    </Button>
                </div>
                <p className="mt-8 text-white/60 text-xs font-bold uppercase tracking-widest">
                    {t('features:freeForever')}
                </p>
            </div>
        </section>

    </div>
  );
};