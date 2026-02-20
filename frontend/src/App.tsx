import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

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
import { AuthModal } from './components/AuthModal'; // 🔥 ADDED

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, loading } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [globalAuthOpen, setGlobalAuthOpen] = useState(false); // 🔥 GLOBAL DEBUG


  const isHomePage = location.pathname === '/';
  const isFeaturesPage = location.pathname === '/features';
  const isAuthPage = location.pathname === '/auth';


  // If authed, send "/" to "/gallery"
  if (!isAuthPage && !loading && user && isHomePage) {
    return <Navigate to="/gallery" replace />;
  }


  const showSidebar = !isHomePage && !isFeaturesPage && !isAuthPage && !!user;
  const showMobileNav = !!user && !isHomePage && !isFeaturesPage && !isAuthPage;


  if (isAuthPage) {
    return <>{children}</>;
  }


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

      {/* Mobile Bottom Navigation */}
      {showMobileNav && <MobileBottomNav onAddClick={() => setIsAddModalOpen(true)} />}

      {/* Add Video Modal */}
      {user && <AddVideoModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />}

      {/* 🔥 GLOBAL AUTH MODAL */}
      <AuthModal isOpen={globalAuthOpen} onClose={() => setGlobalAuthOpen(false)} />

      {!isAuthPage && (
        <footer className="hidden md:block bg-dark-900 text-white pt-16 pb-24 md:pb-8 border-t border-gray-800">
          <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12">
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-2 mb-4">
                  <img
                    src="https://raw.githubusercontent.com/SE7EN2606/recolekt/81dfd0ba97241d903f74e94e9e795b09ed6ab48d/recolekt_logo_white_bg.svg"
                    alt="recolekt"
                    className="h-8 md:h-9"
                  />
                </div>
                <p className="text-gray-500 text-sm leading-relaxed">Save and organize your favorite reels.</p>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">Product</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">Company</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white mb-4">Legal</h4>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-800 text-center md:text-left">
              <p className="text-gray-500 text-sm">© 2025 recolekt. Respecting privacy and platform terms of service.</p>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

function App() {
  return (
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
  );
}

export default App;
