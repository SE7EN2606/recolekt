import React from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { Gallery } from './pages/Gallery';
import { VideoDetail } from './pages/VideoDetail.tsx';


const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const showSidebar = !isHomePage;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <Header />
      {/* ✅ Added pt-[85px] md:pt-[90px] to account for fixed header */}
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
      <footer className="hidden md:block bg-dark-900 text-white pt-16 pb-24 md:pb-8 border-t border-gray-800">
        <div className="max-w-[1100px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="https://raw.githubusercontent.com/SE7EN2606/recolekt/81dfd0ba97241d903f74e94e9e795b09ed6ab48d/recolekt_logo_white_bg.svg"
                  alt="recolek_logo_white"
                  className="h-8 md:h-9"
                />
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Save and organize your favorite reels.
              </p>
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
            <p className="text-gray-500 text-sm">
              © 2025 recolekt. Respecting privacy and platform terms of service.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/gallery/:folderId" element={<Gallery />} />
            <Route path="/video/:id" element={<VideoDetail />} />
            <Route path="/reel/:id" element={<VideoDetail />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;
