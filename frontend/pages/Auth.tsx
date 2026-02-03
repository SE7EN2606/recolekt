import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';

/*
✅ FIXED SAFE BASE URL
*/
const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') ||
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ||
  'http://localhost:5001';

// Custom Download Icon
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
    <path d="M21 15v4a2 0 0 1-2 2H5a2 0 0 1-2-2v-4"/>
    <path d="m7 10 5 5 5-5"/>
  </svg>
);

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [hasPendingVideo, setHasPendingVideo] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();

  useEffect(() => {
    const pending = localStorage.getItem('pendingVideoUrl');
    if (pending) setHasPendingVideo(true);
  }, []);

  useEffect(() => {
    if (user) {
      navigate('/gallery', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const email = formData.get('email');
      const password = formData.get('password');
      const name = formData.get('name');

      const payload = {
        email: email || 'demo@demo.com',
        password: password || 'demo',
        name: name || ''
      };

      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (response.ok) {
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
    <div className="min-h-screen w-full relative bg-white flex flex-col md:flex-row">
      
      <div className="fixed inset-0 flex pointer-events-none">
        <div className="hidden md:block w-1/2 h-full bg-[#0B0F19] relative">
           <div className="absolute top-0 left-0 w-full h-full bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
           <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-[#0B0F19]"></div>
        </div>
        <div className="w-full md:w-1/2 h-full bg-white"></div>
      </div>

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
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-500">
                digital inspiration.
              </span>
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
                
                {hasPendingVideo && (
                  <div 
                    className="mb-4 p-3 rounded-xl flex items-center justify-center gap-2 animate-fade-in border transition-all duration-300"
                    style={{
                      backgroundColor: isLogin ? 'rgba(225, 29, 72, 0.05)' : 'rgba(139, 92, 246, 0.05)',
                      borderColor: isLogin ? 'rgba(225, 29, 72, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                      color: isLogin ? '#e11d48' : '#8b5cf6'
                    }}
                  >
                    {isLogin ? <AlertCircle size={18}/> : <DownloadIcon color="#8b5cf6"/>}
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

                {/* GOOGLE LOGIN */}
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

                {/* FORM */}
                <form onSubmit={handleSubmit} className="space-y-3">

                   {!isLogin && (
                     <div className="space-y-1 animate-fade-in-down">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">
                         Full Name
                       </label>
                       <div className="relative">
                         <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                         <input name="name" className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 pl-11 pr-4"/>
                       </div>
                     </div>
                   )}

                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">
                       Email Address
                     </label>
                     <input name="email" type="email" className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4"/>
                   </div>

                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">
                       Password
                     </label>
                     <input name="password" type="password" className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4"/>
                   </div>

                   <Button type="submit" fullWidth disabled={loading}>
                     {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                   </Button>

                </form>

                <div className="mt-4 text-center">
                  <button 
                    onClick={() => setIsLogin(!isLogin)} 
                    className="font-black text-red-500"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};
