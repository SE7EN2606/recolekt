import React, { useState, Suspense } from 'react'; // 🔥 ADDED Suspense
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from './i18n'; // 🔥 IMPORT i18n

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

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { t } = useTranslation(['common']); // 🔥 TRANSLATION HOOK
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [globalAuthOpen, setGlobalAuthOpen] = useState(false); 

  const isHomePage = location.pathname === '/';
  const isFeaturesPage = location.pathname === '/features';
  const isAuthPage = location.pathname === '/auth';

  if (!isAuthPage && !loading && user && isHomePage) {
    return <Navigate to="/gallery" replace />;
  }

  const showSidebar = !isHomePage && !isFeaturesPage && !isAuthPage && !!user;
  const showMobileNav = !!user && !isHomePage && !isFeaturesPage && !isAuthPage;

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <Header />

      <main className="flex-1 w-full max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8 pb-24 md:pb-0 pt-[70px] md:pt-[110px]">
        <div className="flex gap-6 lg:gap-8">
          {showSidebar && (
            <div className="hidden md:block w-[240px] lg:w-[260px] flex-shrink-0">
              <Sidebar />
            </div>
          )}
          <div className="flex-1 w-full min-w-0">{children}</div>
        </div>
      </main>

      {showMobileNav && <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />}
      {user && <AddVideoModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />}
      <AuthModal isOpen={globalAuthOpen} onClose={() => setGlobalAuthOpen(false)} />

      {!isAuthPage && (
        <footer className="hidden md:block bg-dark-900 text-white pt-16 pb-24 md:pb-8 border-t border-gray-800">
          <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <img src="https://raw.githubusercontent.com/SE7EN2606/recolekt/81dfd0ba97241d903f74e94e9e795b09ed6ab48d/recolekt_logo_white_bg.svg" alt="recolekt" className="h-8 md:h-9" />
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">{t('common:footerSlogan')}</p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">{t('common:product')}</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:features')}</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">{t('common:pricing')}</a></li>
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

            <div className="pt-8 border-t border-gray-800 text-center md:text-left">
              <p className="text-gray-500 text-sm">{t('common:footerCopyright')}</p>
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
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f8fafc]"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div></div>}>
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