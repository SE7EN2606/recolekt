import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Globe, LogOut, ChevronRight, 
  HelpCircle, Info, Moon, Sun, Zap, Check, Video, Infinity, PieChart
} from 'lucide-react';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const AppSettings: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, user, loading, isAuthenticated } = useAuth();
  const [lang, setLang] = useState<'EN' | 'FR'>('EN');
  const [darkMode, setDarkMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isPro = user?.isPro || false;
  const clipsUsed = 4;
  const clipsLimit = 5;
  const remaining = clipsLimit - clipsUsed;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [loading, isAuthenticated, navigate]);

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const SettingItem = ({ icon: Icon, label, onClick, badge, rightContent }: any) => (
    <button 
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 transition-colors border-b border-gray-50 last:border-0 hover:bg-gray-50 group text-left"
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500 group-hover:text-primary-600 transition-colors">
          <Icon size={20} />
        </div>
        <span className="font-bold text-sm text-gray-900">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {badge && (
          <span className="px-2 py-0.5 bg-primary-600 text-white text-[9px] font-black rounded uppercase tracking-wider">
            {badge}
          </span>
        )}
        {!rightContent && <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-400" />}
      </div>
    </button>
  );

  if (loading || !user) return null;

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      <div className="flex flex-col gap-6 mb-8 px-4 md:px-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {lang === 'EN' ? 'App Settings' : 'Paramètres'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage your account and preferences</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* User Card */}
        <div className="bg-white md:rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center gap-5 mb-6">
            <div className="w-16 h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg overflow-hidden border-2 border-white">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                user?.name?.charAt(0) || 'U'
              )}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase">
                {user?.name || 'User'}
              </h2>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Personal Account</p>
            </div>
          </div>

          <Button 
            variant="outline" 
            fullWidth 
            className="rounded-xl py-3 border-gray-200 text-gray-900 font-bold text-sm bg-white hover:bg-gray-50 mb-8"
            onClick={() => navigate('/settings/account')}
          >
            <User size={16} className="mr-2" /> Edit Personal Info
          </Button>

          <div className="pt-8 border-t border-gray-100">
             <div className="flex items-center justify-between mb-6">
               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Plan</span>
               <span className={`px-4 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-white shadow-lg ${
                  isPro 
                    ? 'bg-[#8b5cf6] shadow-purple-500/20' 
                    : 'bg-[#f43f5e] shadow-rose-500/20'
                }`}>
                  {isPro ? 'PRO' : 'FREE'}
               </span>
             </div>

             {isPro ? (
               <div className="bg-primary-50 rounded-2xl p-6 border border-primary-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="p-3 bg-white rounded-full text-primary-600 shadow-sm">
                        <Infinity size={24} />
                     </div>
                     <div>
                        <div className="font-black text-gray-900">Unlimited Clips</div>
                        <div className="text-xs font-medium text-primary-600">You are unstoppable.</div>
                     </div>
                  </div>
               </div>
             ) : (
               <>
                 <div className="flex items-center justify-between mb-3">
                   <span className="text-xs font-bold text-gray-900">Usage Limit</span>
                   <span className="text-[#f43f5e] text-xs font-black bg-rose-50 px-2 py-1 rounded-lg">
                     Only {remaining} {remaining === 1 ? 'clip' : 'clips'} left
                   </span>
                 </div>

                 <div className="relative h-4 w-full bg-gray-100 rounded-full overflow-hidden mb-8">
                   <div 
                     className="h-full bg-[#f43f5e] transition-all duration-700 shadow-[0_0_10px_rgba(244,63,94,0.4)]" 
                     style={{ width: `${(clipsUsed / clipsLimit) * 100}%` }}
                   />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                      <Video size={20} className="mx-auto mb-2 text-gray-400" />
                      <div className="text-xl font-black text-gray-900">{clipsUsed}</div>
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Used</div>
                   </div>
                   <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-center">
                      <PieChart size={20} className="mx-auto mb-2 text-gray-400" />
                      <div className="text-xl font-black text-gray-900">{clipsLimit}</div>
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Limit</div>
                   </div>
                 </div>
               </>
             )}
          </div>
        </div>

        {/* Upgrade Card */}
        {!isPro && (
          <div className="bg-dark-900 rounded-3xl shadow-xl shadow-dark-900/20 p-6 md:p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-black mb-6 tracking-tight">Unlock Unlimited Clips</h3>
              <div className="space-y-3 mb-8">
                {['Unlimited videos & collections', 'AI auto-categorization', 'Priority support'].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                    <Check size={16} className="text-green-400 flex-shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
              <Button 
                fullWidth
                className="bg-white text-dark-900 hover:bg-[#8b5cf6] hover:text-white font-black border-transparent shadow-lg py-4 transition-all"
                onClick={() => navigate('/billing')}
              >
                <Zap size={18} className="text-yellow-500 fill-current mr-2" /> Upgrade to Pro
              </Button>
            </div>
          </div>
        )}

        {/* Preferences & Resources */}
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">Preferences</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="w-full flex items-center justify-between p-5 border-b border-gray-50">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500"><Globe size={20} /></div>
                  <span className="font-bold text-sm text-gray-900">Language</span>
                </div>
                <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl">
                  <button onClick={() => setLang('EN')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${lang === 'EN' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>English</button>
                  <button onClick={() => setLang('FR')} className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${lang === 'FR' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Français</button>
                </div>
              </div>

              <div className="w-full flex items-center justify-between p-5">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-gray-50 text-gray-500">{darkMode ? <Moon size={20} /> : <Sun size={20} />}</div>
                  <span className="font-bold text-sm text-gray-900">Dark Mode</span>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">Resources</h3>
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
              <SettingItem icon={HelpCircle} label="Help & Support" onClick={() => navigate('/help?section=how-to')} />
              <SettingItem icon={Info} label="About Recolekt" onClick={() => navigate('/help?section=about')} />
            </div>
          </section>
        </div>

        <div className="pb-24 md:pb-8">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white border border-red-100 text-red-600 rounded-2xl font-black text-sm hover:bg-red-600 hover:text-white transition-all shadow-sm"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <ConfirmModal 
        isOpen={showLogoutConfirm} 
        onClose={() => setShowLogoutConfirm(false)} 
        onConfirm={handleLogout} 
        title="Sign Out" 
        message="Are you sure you want to log out?" 
        confirmLabel="Sign Out" 
      />
    </div>
  );
};
