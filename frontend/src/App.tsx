import { API_BASE } from "./utils/api";
import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import i18n from './i18n';

import { LanguageProvider } from './context/LanguageContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { useAuth } from './context/AuthContext';
import LogoWhite from './assets/recolekt_logo_white.png';
import { InstallPrompt } from './components/InstallPrompt';
import { ProfileSettings } from './pages/AdminDashboard';

const Gallery         = lazy(() => import('./pages/Gallery').then(m => ({ default: m.Gallery })));
const Cookbook        = lazy(() => import('./pages/Cookbook').then(m => ({ default: m.Cookbook })));
const VideoDetail     = lazy(() => import('./pages/VideoDetail').then(m => ({ default: m.VideoDetail })));
const Organizer       = lazy(() => import('./pages/Organizer').then(m => ({ default: m.Organizer })));
const AccountSettings = lazy(() => import('./pages/AccountSettings').then(m => ({ default: m.AccountSettings })));
const BillingPage     = lazy(() => import('./pages/BillingPage').then(m => ({ default: m.BillingPage })));
const SubscribePage   = lazy(() => import('./pages/SubscribePage').then(m => ({ default: m.SubscribePage })));
const Features        = lazy(() => import('./pages/Features').then(m => ({ default: m.Features })));
const Auth            = lazy(() => import('./pages/Auth').then(m => ({ default: m.Auth })));
const SavedPlaces     = lazy(() => import('./pages/SavedPlaces').then(m => ({ default: m.SavedPlaces })));
const AdminPanel      = lazy(() => import('./pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const ShoppingList    = lazy(() => import('./pages/ShoppingList').then(m => ({ default: m.ShoppingList })));
const MobileBottomNav = lazy(() => import('./components/MobileBottomNav').then(m => ({ default: m.MobileBottomNav })));
const AddVideoModal   = lazy(() => import('./components/AddVideoModal').then(m => ({ default: m.AddVideoModal })));


const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation(['common']);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const isAuthPage = location.pathname === '/auth';
  const fullWidthPages = ['/', '/billing', '/billing/success', '/billing/cancel', '/subscribe', '/auth', '/features'];
  const showSidebar = user && !fullWidthPages.includes(location.pathname);
  const showFooter = ['/', '/features', '/billing'].includes(location.pathname);
  const mainBottomPadding = user && !showFooter ? 'pb-24' : 'pb-6';

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900 selection:bg-primary-100">
      {!isAuthPage && <Header />}

      <main className={`flex-1 w-full mx-auto ${isAuthPage ? 'pt-0' : `max-w-7xl px-4 md:px-8 ${mainBottomPadding} md:pb-0 pt-20 md:pt-27.5`}`}>
        <div className="flex gap-6 items-start">
          {showSidebar && <Sidebar />}
          <div className="flex-1 w-full min-w-0 animate-fade-in">{children}</div>
        </div>
      </main>

      {user && !isAuthPage && (
        <Suspense fallback={null}>
          <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />
          <AddVideoModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
        </Suspense>
      )}

      <InstallPrompt />

      {showFooter && (
        <footer className="bg-gray-900 text-white pt-16 pb-24 md:pb-8 border-t border-gray-800 mt-auto relative z-30 w-full">
          <div className="max-w-7xl mx-auto px-6 md:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
              <div className="col-span-2 md:col-span-1">
                <img alt="recolekt logo" className="h-8 mb-4 object-contain" src={LogoWhite} />
                <p className="text-gray-400 text-sm leading-relaxed">{t('common:footerSlogan')}</p>
              </div>
              <div>
                <h4 className="font-bold mb-4">{t('common:product')}</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><a href="/features" className="hover:text-white">{t('common:features')}</a></li>
                  <li><a href="/billing" className="hover:text-white">{t('common:pricing')}</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4">{t('common:company')}</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white">{t('common:about')}</a></li>
                  <li><a href="#" className="hover:text-white">{t('common:blog')}</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4">{t('common:legal')}</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>
                    <a href="/legal" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                      {t('common:privacy')}
                    </a>
                  </li>
                  <li>
                    <a href="/legal#terms" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                      {t('common:terms')}
                    </a>
                  </li>
                  <li>
                    <a href="/legal#deletion" target="_blank" rel="noopener noreferrer" className="hover:text-white">
                      {t('common:dataDeletion')}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="pt-8 border-t border-gray-800 text-gray-500 text-sm">{t('common:footerCopyright')}</div>
          </div>
        </footer>
      )}
    </div>
  );
};


function App() {
  return (
    <I18nextProvider i18n={i18n}>
        <LanguageProvider>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>}>
            <Router>
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/features" element={<Features />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/billing" element={<BillingPage />} />
                  <Route path="/organizer" element={<Organizer />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/gallery/:folderId" element={<Gallery />} />
                  <Route path="/cookbook" element={<Cookbook />} />
                  <Route path="/video/:id" element={<VideoDetail />} />
                  <Route path="/settings" element={<AccountSettings />} />
                  <Route path="/profile" element={<ProfileSettings />} />
                  <Route path="/places" element={<SavedPlaces />} />
                  <Route path="/grocery-list" element={<ShoppingList />} />
                  <Route path="/admin" element={<AdminPanel />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </Router>
          </Suspense>
        </LanguageProvider>
    </I18nextProvider>
  );
}

export default App;
