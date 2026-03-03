import { API_BASE } from "../utils/api";
import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Mail, Shield, FileText, Pin } from 'lucide-react';
import { Button } from '../components/Button';
import { useTranslation } from 'react-i18next'; // ✅ ADDED

export const HelpSupport: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const { t } = useTranslation(['help', 'common']); // ✅ INITIALIZED
  
  const howToRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });

    const timer = setTimeout(() => {
      if (section === 'about' && aboutRef.current) {
        aboutRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (section === 'how-to' && howToRef.current) {
        howToRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (section === 'contact' && contactRef.current) {
        contactRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [section]);

  const SectionHeader = ({ title }: { title: string }) => (
    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 px-4">{title}</h3>
  );

  return (
    <div className="max-w-2xl mx-auto pb-20 animate-fade-in">
      <button 
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors mb-8 font-black uppercase text-xs tracking-widest p-4 md:p-0"
      >
        <ArrowLeft size={18} /> {t('common:back', 'Back')}
      </button>

      <div className="space-y-12">
        {/* How to Pin Block */}
        <section id="how-to" ref={howToRef} className="scroll-mt-24">
          <SectionHeader title={t('help:howToPin', 'How to Pin')} />
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8">
            <div className="flex items-center gap-4 mb-10">
               <div className="w-14 h-14 bg-primary-600 rounded-[20px] flex items-center justify-center text-white shadow-xl shadow-primary-600/20">
                  <Pin size={28} />
               </div>
               <div>
                  <h4 className="text-2xl font-black text-gray-900 tracking-tight">{t('help:pinningContent', 'Pinning Content')}</h4>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">{t('help:buildLibrary', 'Build your library in seconds')}</p>
               </div>
            </div>
            
            <div className="space-y-10">
              {[
                { 
                  s: 1, 
                  t: t('help:step1Title', 'Copy link from Instagram'), 
                  d: t('help:step1Desc', "Open any public Reel, tap share, and select 'Copy Link'.") 
                },
                { 
                  s: 2, 
                  t: t('help:step2Title', 'Paste in Recolekt'), 
                  d: t('help:step2Desc', "Come back here and paste it into the main search bar on the home screen.") 
                },
                { 
                  s: 3, 
                  t: t('help:step3Title', 'AI Magic'), 
                  d: t('help:step3Desc', "We'll automatically extract the category, summary, and bullet points for you.") 
                }
              ].map(step => (
                <div key={step.s} className="flex gap-6 items-start">
                  <div className="w-12 h-12 bg-gray-50 text-gray-900 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-lg border border-gray-100 shadow-sm">{step.s}</div>
                  <div className="pt-1">
                    <h4 className="text-lg font-black text-gray-900 mb-1">{step.t}</h4>
                    <p className="text-gray-500 text-sm font-medium leading-relaxed">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button 
              fullWidth 
              className="mt-12 bg-dark-900 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs"
              onClick={() => navigate('/')}
            >
              {t('help:tryFirstPin', 'Try your first pin')}
            </Button>
          </div>
        </section>

        {/* Contact Support */}
        <section id="contact" ref={contactRef} className="scroll-mt-24">
          <SectionHeader title={t('help:contactSupport', 'Contact Support')} />
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-8">
            <p className="text-gray-500 font-medium mb-8 leading-relaxed text-sm">
              {t('help:supportDesc', 'Have questions about your plan or facing a technical bug? Our team is available 24/7.')}
            </p>
            <div className="space-y-4">
              <a href="mailto:support@recolekt.app" className="block p-6 bg-gray-50 rounded-[24px] border border-gray-100 hover:border-primary-200 transition-all group shadow-sm hover:shadow-md">
                <div className="flex items-center gap-5">
                  <div className="p-3 bg-white rounded-2xl text-primary-600 group-hover:scale-110 transition-transform"><Mail size={24} /></div>
                  <div>
                    <span className="block font-black text-gray-900 tracking-tight text-lg">{t('help:emailSupport', 'Email Support')}</span>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">SUPPORT@RECOLEKT.APP</span>
                  </div>
                </div>
              </a>
              <div className="p-6 bg-gray-50 rounded-[24px] border border-gray-100 opacity-60 flex items-center gap-5">
                <div className="p-3 bg-white rounded-2xl text-gray-400"><MessageSquare size={24} /></div>
                <div>
                  <span className="block font-black text-gray-900 tracking-tight text-lg">{t('help:priorityChat', 'Priority Chat')}</span>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('help:proExclusive', 'PRO EXCLUSIVE')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About Block */}
        <section id="about" ref={aboutRef} className="scroll-mt-24">
          <SectionHeader title={t('help:aboutRecolekt', 'About Recolekt')} />
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 text-center">
            <img src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/recolekt_logo_black.png" alt="Logo" className="h-10 mx-auto mb-8" />
            <p className="text-gray-500 font-medium mb-10 leading-relaxed max-w-sm mx-auto text-sm">
              {t('help:aboutDesc', 'Recolekt is built for knowledge seekers who want to turn their daily video discoveries into a permanent library of wisdom.')}
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
              <button className="flex items-center justify-center gap-2 p-5 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-900 hover:bg-gray-100 transition-colors">
                <Shield size={16} /> {t('common:privacyPolicy', 'Privacy Policy')}
              </button>
              <button className="flex items-center justify-center gap-2 p-5 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-900 hover:bg-gray-100 transition-colors">
                <FileText size={16} /> {t('common:termsOfUse', 'Terms of Use')}
              </button>
            </div>

            <div className="pt-8 border-t border-gray-50 flex flex-col items-center">
              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{t('help:version', 'Version 1.0.4 (Stable)')}</span>
              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-1">{t('help:copyright', '© 2025 Recolekt Labs. Worldwide.')}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};