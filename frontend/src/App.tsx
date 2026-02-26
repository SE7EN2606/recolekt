import React, { useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from './i18n';

import { LanguageProvider } from './context/LanguageContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AddVideoModal } from './components/AddVideoModal';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { VideoDetail } from './pages/VideoDetail';
import { SubscribePage } from './pages/SubscribePage';
import { BillingSuccess } from './pages/BillingSuccess';
import { BillingCancel } from './pages/BillingCancel';
import { BillingPage } from './pages/BillingPage';
import { Features } from './pages/Features';
import { Auth } from './pages/Auth';
import { AccountSettings } from './pages/AccountSettings';
import { AppSettings } from './pages/AppSettings';
import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';

import LogoWhite from './assets/recolekt_logo_white.png';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { t } = useTranslation(['common']);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [globalAuthOpen, setGlobalAuthOpen] = useState(false);

  const isHomePage = location.pathname === '/';
  const isAuthPage = location.pathname === '/auth';

  // Prevent logged-in users from seeing the home page (redirects to gallery)
  if (!isAuthPage && !loading && user && isHomePage) {
    return <Navigate to="/gallery" replace />;
  }

  // Specific overrides where sidebar shouldn't show
  const fullWidthPages = ['/', '/billing', '/billing/success', '/billing/cancel', '/subscribe', '/auth', '/features'];
  const showSidebar = user && !fullWidthPages.includes(location.pathname);
  
  const mobileBottomPadding = user ? 'pb-24' : 'pb-6';

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900 selection:bg-primary-100 selection:text-primary-900">
      {!isAuthPage && <Header />}

      <main 
        className={`flex-1 w-full mx-auto ${isAuthPage ? 'pt-0 pb-0 !max-w-none !px-0' : `max-w-[1280px] px-6 md:px-8 ${mobileBottomPadding} md:pb-0 pt-[80px] md:pt-[110px]`}`}
      >
        <div className={`flex gap-6 lg:gap-8 ${isAuthPage ? 'pt-0' : ''}`}>
          {showSidebar && (
            <div className="hidden md:block w-[240px] lg:w-[260px] flex-shrink-0">
              <Sidebar />
            </div>
          )}
          
          <div className="flex-1 w-full min-w-0 animate-fade-in">
             {children}
          </div>
        </div>
      </main>

      {/* Auth Modal & Add Video Modal for globally triggering them */}
      {user && !isAuthPage && <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />}
      {user && <AddVideoModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />}
      <AuthModal isOpen={globalAuthOpen} onClose={() => setGlobalAuthOpen(false)} />

      {/* FOOTER: Show on all public pages except Auth */}
      {!isAuthPage && !user && (
        <footer className="bg-gray-900 text-white pt-16 pb-28 md:pb-8 border-t border-gray-800 mt-auto relative z-10">
          <div className="max-w-[1280px] mx-auto px-6 md:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-12 mb-12">
              
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <img 
                    src={LogoWhite} 
                    alt="recolekt" 
                    className="h-8 md:h-9 object-contain"
                  />
                </div>
                <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
                  {t('common:footerSlogan')}
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">{t('common:product')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="/features" className="hover:text-white transition-colors">{t('common:features')}</a></li>
                  <li><a href="/billing" className="hover:text-white transition-colors">{t('common:pricing')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:security')}</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">{t('common:company')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:about')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:blog')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:contact')}</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">{t('common:legal')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:privacy')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:terms')}</a></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-gray-500 text-sm text-center md:text-left">
                {t('common:footerCopyright')}
              </p>
              <div className="flex items-center gap-6">
                <a href="#" className="text-gray-500 hover:text-white text-sm font-medium transition-colors">{t('common:privacy')}</a>
                <a href="#" className="text-gray-500 hover:text-white text-sm font-medium transition-colors">{t('common:terms')}</a>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      }>
        <LanguageProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/features" element={<Features />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/gallery/:folderId" element={<Gallery />} />
                <Route path="/video/:id" element={<VideoDetail />} />
                <Route path="/reel/:id" element={<VideoDetail />} />
                <Route path="/settings/app" element={<AppSettings />} />
                <Route path="/settings/account" element={<AccountSettings />} />
                <Route path="/settings" element={<Navigate to="/settings/app" replace />} />
                <Route path="/subscribe" element={<SubscribePage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/billing/success" element={<BillingSuccess />} />
                <Route path="/billing/cancel" element={<BillingCancel />} />
              </Routes>
            </Layout>
          </Router>
        </LanguageProvider>
      </Suspense>
    </I18nextProvider>
  );
}

export default App;