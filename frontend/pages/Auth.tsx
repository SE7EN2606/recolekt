import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext'; // ✅ Using correct Auth Context

const API_BASE = import.meta.env.VITE_API_BASE;

// Custom Download Icon (from your SVG data)
const DownloadIcon = ({ color }: { color: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="18" 
    height="18" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M12 15V3"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <path d="m7 10 5 5 5-5"/>
  </svg>
);

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [hasPendingVideo, setHasPendingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  // ✅ Use AuthContext to prevent loops
  const { user, signInWithGoogle } = useAuth();

  useEffect(() => {
    // Check local storage. If this is empty, NO message will show.
    const pending = localStorage.getItem('pendingVideoUrl');
    if (pending) {
      setHasPendingVideo(true);
    }
  }, []);

  // ✅ Safe Redirect: Only happens when AuthContext confirms user exists
  useEffect(() => {
    if (user) {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    // ✅ Real API Login to prevent 401 loops
    try {
      const formData = new FormData(e.currentTarget);
      const email = formData.get('email');
      const password = formData.get('password');
      
      // Default to demo if empty (for testing)
      const payload = {
        email: email || 'demo@demo.com',
        password: password || 'demo'
      };

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (response.ok) {
        // Force a small reload to ensure all contexts sync up perfectly
        window.location.reload();
      } else {
        alert("Authentication failed. Please try again.");
        setLoading(false);
      }
    } catch (error) {
      console.error("Auth error:", error);
      setLoading(false);
    }
  };

  return (
    // FIX 1: Outer wrapper is w-full (Full Width) so background spans edge-to-edge
    <div className="min-h-screen w-full relative bg-white flex flex-col md:flex-row">
      
      {/* LAYER 1: Full-Screen Backgrounds */}
      {/* FIX 2: Changed to 'fixed' so it stays 50/50 even when scrolling */}
      <div className="fixed inset-0 flex pointer-events-none">
        <div className="hidden md:block w-1/2 h-full bg-[#0B0F19] relative">
           <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
           <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-[#0B0F19]"></div>
        </div>
        <div className="w-full md:w-1/2 h-full bg-white"></div>
      </div>

      {/* LAYER 2: Content Container (Max 1100px) */}
      {/* FIX 3: max-w-[1100px] and min-h-screen applied HERE to center content and allow scroll */}
      <div className="relative z-10 w-full max-w-[1100px] mx-auto min-h-screen flex flex-col md:flex-row">
        
        {/* LEFT COLUMN */}
        <div className="hidden md:flex w-1/2 flex-col justify-between py-16 pr-16 text-white h-full">
          <div>
            <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
              <img 
                src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/frontend/assets/recolekt_logo_white.svg" 
                alt="recolekt" 
                className="h-10" 
              />
            </Link>
          </div>

          <div className="max-w-lg">
            <h1 className="text-5xl font-black tracking-tight mb-6 leading-tight">
              Stop losing your <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">digital inspiration.</span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed font-medium">
              Join thousands of creators who use Recolekt to organize their visual chaos into a searchable library.
            </p>
          </div>

          <div className="flex gap-4 text-xs font-black uppercase tracking-widest text-gray-500">
            <span>© 2025 Recolekt</span>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
            <Link to="/help?section=contact" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full md:w-1/2 flex flex-col justify-start items-center h-full relative pl-0 md:pl-16 pt-24 md:pt-18">
            
            <div className="hidden md:block absolute top-12 right-0">
               <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-900 font-bold text-sm transition-colors">
                  <ArrowLeft size={16} /> Back to Homepage
               </Link>
            </div>

            <div className="md:hidden w-full flex justify-between items-center absolute top-6 px-6">
               <Link to="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-900 font-bold text-xs uppercase tracking-wider">
                  <ArrowLeft size={16} /> Home
               </Link>
               <img 
                  src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/frontend/assets/recolekt_logo_black.svg" 
                  alt="recolekt" 
                  className="h-6" 
                />
            </div>

            <div className="w-full max-w-sm">
                
                {/* CONDITIONAL NOTIFICATION */}
                {hasPendingVideo && (
                  <div 
                    className="mb-4 p-3 rounded-xl flex items-center justify-center gap-2 animate-fade-in border transition-all duration-300"
                    style={{
                      backgroundColor: isLogin ? 'rgba(225, 29, 72, 0.05)' : 'rgba(139, 92, 246, 0.05)',
                      borderColor: isLogin ? 'rgba(225, 29, 72, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                      color: isLogin ? '#e11d48' : '#8b5cf6'
                    }}
                  >
                    {isLogin ? (
                      <AlertCircle size={18} className="flex-shrink-0" />
                    ) : (
                      <DownloadIcon color="#8b5cf6" />
                    )}
                    <p className="text-xs font-bold whitespace-nowrap">
                      {isLogin 
                        ? "You must log in or create an account to save this clip." 
                        : "Create an account and we'll save this clip for you."
                      }
                    </p>
                  </div>
                )}

                {/* HEADER */}
                <div className={`text-center mb-4 ${!hasPendingVideo ? 'mt-10' : ''}`}>
                  <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                    {isLogin ? 'Welcome to Recolekt' : 'Create an account'}
                  </h2>
                  <p className="text-gray-500 text-sm font-medium">
                    {isLogin ? 'Enter your details to access your collection.' : 'Start curating your inspiration today.'}
                  </p>
                </div>

                {/* SOCIAL BUTTON - Connected to signInWithGoogle */}
                <div className="mb-4">
                  <button 
                    type="button" 
                    onClick={signInWithGoogle} 
                    className="w-full flex items-center justify-center gap-3 p-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all text-sm shadow-sm"
                  >
                    <img 
                      src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" 
                      alt="Google" 
                      className="w-5 h-5" 
                    />
                    <span>Continue with Google</span>
                  </button>
                </div>

                {/* DIVIDER */}
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-4 text-gray-400 font-black tracking-widest">Or continue with email</span>
                  </div>
                </div>

                {/* FORM - Added names for API handling */}
                <form onSubmit={handleSubmit} className="space-y-3">
                   {!isLogin && (
                     <div className="space-y-1 animate-fade-in-down">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Full Name</label>
                       <div className="relative">
                         <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input 
                           type="text" 
                           name="name"
                           placeholder="John Doe"
                           className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all font-medium text-gray-900 placeholder:text-gray-400 text-sm"
                         />
                       </div>
                     </div>
                   )}

                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Email Address</label>
                     <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                       <input 
                         type="email" 
                         name="email"
                         placeholder="name@example.com"
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all font-medium text-gray-900 placeholder:text-gray-400 text-sm"
                       />
                     </div>
                   </div>

                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Password</label>
                     <div className="relative">
                       <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                       <input 
                         type="password" 
                         name="password"
                         placeholder="••••••••"
                         className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all font-medium text-gray-900 placeholder:text-gray-400 text-sm"
                       />
                     </div>
                   </div>

                   {isLogin && (
                     <div className="flex justify-end">
                       <button type="button" className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors">Forgot password?</button>
                     </div>
                   )}

                   <Button 
                     type="submit" 
                     fullWidth 
                     className={`h-12 mt-4 text-sm font-black shadow-xl shadow-primary-600/20 rounded-xl ${loading ? 'opacity-80' : ''}`}
                     disabled={loading}
                   >
                     {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                   </Button>
                </form>

                <div className="mt-4 text-center">
                  <p className="text-gray-500 text-sm font-medium">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                    <button 
                      onClick={() => setIsLogin(!isLogin)} 
                      className="font-black hover:underline transition-colors"
                      style={{ color: '#e11d48' }}
                    >
                      {isLogin ? 'Sign Up' : 'Sign In'}
                    </button>
                  </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
