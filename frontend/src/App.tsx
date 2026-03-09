import { API_BASE, GOOGLE_CLIENT_ID } from "./utils/api";
import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { GoogleOAuthProvider } from '@react-oauth/google';
import i18n from './i18n';

import { LanguageProvider } from './context/LanguageContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AddVideoModal } from './components/AddVideoModal';
import { Features } from './pages/Features';
import { Auth } from './pages/Auth';
import { HelpSupport } from './pages/HelpSupport';
import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { useData } from './context/DataContext';
import { InstallPrompt } from './components/InstallPrompt';
import { IOSInstallPrompt } from './components/IOSInstallPrompt'; 

import LogoWhite from './assets/recolekt_logo_white.png';

// ✅ LAZY LOAD HEAVY PAGES
const Gallery = lazy(() => import('./pages/Gallery').then(module => ({ default: module.Gallery })));
const VideoDetail = lazy(() => import('./pages/VideoDetail').then(module => ({ default: module.VideoDetail })));
const Organizer = lazy(() => import('./pages/Organizer').then(module => ({ default: module.Organizer })));
const AppSettings = lazy(() => import('./pages/AppSettings').then(module => ({ default: module.AppSettings })));
const AccountSettings = lazy(() => import('./pages/AccountSettings').then(module => ({ default: module.AccountSettings })));
const BillingPage = lazy(() => import('./pages/BillingPage').then(module => ({ default: module.BillingPage })));
const SubscribePage = lazy(() => import('./pages/SubscribePage').then(module => ({ default: module.SubscribePage })));
const BillingSuccess = lazy(() => import('./pages/BillingSuccess').then(module => ({ default: module.BillingSuccess })));
const BillingCancel = lazy(() => import('./pages/BillingCancel').then(module => ({ default: module.BillingCancel })));

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { t } = useTranslation(['common']);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [globalAuthOpen, setGlobalAuthOpen] = useState(false);

  const isHomePage = location.pathname === '/';
  const isAuthPage = location.pathname === '/auth';

  if (!isAuthPage && !loading && user && isHomePage) {
    return <Navigate to="/gallery" replace />;
  }

  const fullWidthPages = ['/', '/billing', '/billing/success', '/billing/cancel', '/subscribe', '/auth', '/features'];
  const showSidebar = user && !fullWidthPages.includes(location.pathname);
  
  const publicPagesWithFooter = ['/', '/features', '/billing'];
  const showFooter = publicPagesWithFooter.includes(location.pathname);
  
  const mainBottomPadding = user && !showFooter ? 'pb-24' : 'pb-6';
  const footerBottomPadding = user ? 'pb-[120px] md:pb-8' : 'pb-12 md:pb-8';

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900 selection:bg-primary-100 selection:text-primary-900 overflow-x-hidden">
      {!isAuthPage && <Header />}

      <main 
        className={`flex-1 w-full mx-auto ${isAuthPage ? 'pt-0 pb-0 !max-w-none !px-0' : `max-w-[1280px] px-4 md:px-8 ${mainBottomPadding} md:pb-0 pt-[80px] md:pt-[110px]`}`}
      >
        <div className={`flex gap-6 ${isAuthPage ? 'pt-0' : ''}`}>
          {showSidebar && (
            <div className="hidden md:block w-[280px] flex-shrink-0">
              <Sidebar />
            </div>
          )}
          
          <div className="flex-1 w-full min-w-0 animate-fade-in">
             {children}
          </div>
        </div>
      </main>

      {user && !isAuthPage && (
        <>
          <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />
          <AddVideoModal 
            isOpen={isAddModalOpen} 
            onClose={() => setIsAddModalOpen(false)} 
          />
        </>
      )}
      
      <AuthModal isOpen={globalAuthOpen} onClose={() => setGlobalAuthOpen(false)} />
      
      <InstallPrompt />
      <IOSInstallPrompt />

      {showFooter && (
        <footer className={`bg-gray-900 text-white pt-16 ${footerBottomPadding} border-t border-gray-800 mt-auto relative z-30 block w-full`}>
          <div className="max-w-[1280px] mx-auto px-6 md:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-12 mb-12">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <img alt="recolekt logo" className="h-8 md:h-9 object-contain" src={LogoWhite} />
                </div>
                <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
                  {t('common:footerSlogan', 'Save, organize, and rediscover your digital inspiration.')}
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-white mb-4">{t('common:product', 'Product')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="/features" className="hover:text-white transition-colors">{t('common:features', 'Features')}</a></li>
                  <li><a href="/billing" className="hover:text-white transition-colors">{t('common:pricing', 'Pricing')}</a></li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-bold text-white mb-4">{t('common:company', 'Company')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:about', 'About')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:blog', 'Blog')}</a></li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-bold text-white mb-4">{t('common:legal', 'Legal')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:privacy', 'Privacy')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:terms', 'Terms')}</a></li>
                </ul>
              </div>
            </div>
            
            <div className="pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-gray-500 text-sm text-center md:text-left">
                © 2025 Recolekt Inc.
              </p>
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
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <LanguageProvider>
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/features" element={<Features />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/help" element={<HelpSupport />} />
                  <Route path="/billing" element={<BillingPage />} />

                  <Route path="/organizer" element={<Organizer />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/gallery/:folderId" element={<Gallery />} />
                  <Route path="/video/:id" element={<VideoDetail />} />
                  <Route path="/reel/:id" element={<VideoDetail />} />
                  <Route path="/settings/app" element={<AppSettings />} />
                  <Route path="/settings/account" element={<AccountSettings />} />
                  <Route path="/settings" element={<Navigate to="/settings/app" replace />} />
                  <Route path="/subscribe" element={<SubscribePage />} />
                  <Route path="/billing/success" element={<BillingSuccess />} />
                  <Route path="/billing/cancel" element={<BillingCancel />} />
                </Routes>
              </Layout>
            </Router>
          </Suspense>
        </LanguageProvider>
      </GoogleOAuthProvider>
    </I18nextProvider>
  );
}

export default App;