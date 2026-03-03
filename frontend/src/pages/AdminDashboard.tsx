import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, TriangleAlert, Loader2 } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { InstallShortcutModal } from '../components/InstallShortcutModal';
import shortcutsIcon from '/assets/shortcuts_icon.png';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT


interface TokenInfo {
  has_token: boolean;
  prefix?: string;
  created_at?: string;
  last_used_at?: string;
}

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();
  const { t } = useTranslation(['account', 'common']); // 🔥 HOOK
  
  const [email, setEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Shortcut modal state
  const [showShortcutModal, setShowShortcutModal] = useState(false);
  const [shortcutData, setShortcutData] = useState<any>(null);
  const [isLoadingShortcut, setIsLoadingShortcut] = useState(false);

  // Geolocation state
  const [country, setCountry] = useState(t('account:detecting'));

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
    window.scrollTo(0, 0);
  }, [user]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) {
      fetchTokenInfo();
    }
  }, [user]);

  // Fetch user location on mount
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.country_name) {
          setCountry(data.country_name);
        } else {
          setCountry(t('account:unknown'));
        }
      })
      .catch(() => setCountry(t('account:unknown')));
  }, [t]);

  const fetchTokenInfo = async () => {
    setIsLoadingToken(true);
    try {
      const response = await fetch(`${API_BASE}/api_token/info`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setTokenInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch token info:', error);
    } finally {
      setIsLoadingToken(false);
    }
  };

  const generateToken = async () => {
    const confirmed = confirm(t('account:revokeConfirm'));
    
    if (!confirmed) return;
    
    setIsGenerating(true);
    try {
      const response = await fetch(`${API_BASE}/api_token/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to generate token');
      
      const data = await response.json();
      
      const copyToken = confirm(
        `${t('account:tokenGenerated')}\n\n${data.token}\n\n` +
        `${t('account:tokenWarning')}`
      );
      
      if (copyToken) {
        await navigator.clipboard.writeText(data.token);
        alert(t('account:copied'));
      }
      
      await fetchTokenInfo();
    } catch (error) {
      console.error('Failed to generate token:', error);
      alert(t('account:generateFailed'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInstallShortcut = async () => {
    try {
      setIsLoadingShortcut(true);
      const response = await fetch(`${API_BASE}/api_token/install-shortcut`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to get shortcut info');

      const data = await response.json();
      setShortcutData(data);
      setShowShortcutModal(true);
    } catch (error) {
      console.error('Error:', error);
      alert(t('account:shortcutFailed'));
    } finally {
      setIsLoadingShortcut(false);
    }
  };

  const handleEmailBlur = async () => {
    if (isEditingEmail && email !== user?.email) {
      console.log('Auto-saving email:', email);
      setIsEditingEmail(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const displayName = user.name || 'User';

  const InputField = ({ label, value, readOnly = false, onChange, onBlur, action }: any) => (
    <div className="border-b border-gray-100 py-6 last:border-0 relative">
      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
        {label}
      </label>
      <div className="flex items-center justify-between gap-4">
        <input 
          type="text"
          value={value}
          readOnly={readOnly}
          onChange={onChange}
          onBlur={onBlur}
          className={`flex-1 bg-transparent text-xl font-black text-gray-900 outline-none transition-colors ${readOnly ? 'cursor-default' : 'focus:text-primary-600'}`}
        />
        {action}
      </div>
    </div>
  );

  return (
    <div className="w-full pt-8 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      <div className="flex flex-col gap-6 mb-8 px-4 md:px-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('account:personalInfo')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('account:manageIdentity')}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Personal Info Card */}
        <div className="bg-white md:rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          
          {/* Avatar Section */}
          <div className="flex items-center gap-5 mb-10 pb-10 border-b border-gray-50">
            <div className="w-16 h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg overflow-hidden border-2 border-white">
              {user.picture ? (
                 <img 
                    src={user.picture} 
                    alt={displayName} 
                    className="w-full h-full object-cover" 
                 />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                {displayName}
              </h2>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">{t('account:personalAccount')}</p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-2">
            <InputField label={t('account:fullName')} value={displayName} readOnly />
            
            <InputField 
              label={t('account:emailAddress')} 
              value={email} 
              readOnly={!isEditingEmail}
              onChange={(e: any) => setEmail(e.target.value)}
              onBlur={handleEmailBlur}
              action={
                <button 
                  onClick={() => setIsEditingEmail(!isEditingEmail)}
                  className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                    ${isEditingEmail 
                      ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-600/20' 
                      : 'bg-white border-gray-200 text-gray-600 hover:border-primary-600 hover:text-primary-600 shadow-sm'}
                  `}
                >
                  {isEditingEmail ? t('account:done') : t('account:edit')}
                </button>
              }
            />

            <InputField label={t('account:country')} value={country} readOnly />
          </div>
        </div>

        {/* iOS/macOS Shortcuts Section */}
        <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 md:rounded-3xl border border-purple-100/50 p-6 md:p-8 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <img 
              src={shortcutsIcon}
              alt="Recolekt Shortcut" 
              className="w-14 h-14 rounded-2xl shadow-lg"
            />
            
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-1">
                {t('account:shortcutTitle')}
              </h3>
              <p className="text-sm text-gray-600 font-medium">
                {t('account:shortcutDesc')}
              </p>
            </div>
          </div>

          <button
            onClick={handleInstallShortcut}
            disabled={isLoadingShortcut}
            className="inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/20 w-full px-8 py-5 text-base font-black uppercase tracking-widest mb-6"
          >
            {isLoadingShortcut ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin mr-3" />
                {t('common:loading')}
              </>
            ) : (
              <>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="w-6 h-6 mr-3"
                >
                  <path d="M12 15V3"></path>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <path d="m7 10 5 5 5-5"></path>
                </svg>
                {t('account:installShortcut')}
              </>
            )}
          </button>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/50">
            <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-gradient-to-b from-[#8b5cf6] to-[#7c3aed] rounded-full"></span>
              {t('account:howToUse')}
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-700 font-medium">
              <li>{t('account:step1')}</li>
              <li>{t('account:step2')}</li>
              <li>{t('account:step3')}</li>
              <li>{t('account:step4')}</li>
              <li>{t('account:step5')}</li>
            </ol>
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-white md:rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('account:paymentMethod')}</h3>
            <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full uppercase tracking-widest">{t('account:viaStripe')}</span>
          </div>
          
          <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 flex items-center justify-between group hover:border-primary-200 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-black italic text-[10px] text-gray-400 shadow-sm">VISA</div>
              <div>
                <span className="block font-black text-gray-900 tracking-tight">•••• 4242</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('account:expires')} 12/26</span>
              </div>
            </div>
            <button 
              onClick={() => window.open('https://billing.stripe.com/p/login/test_portal', '_blank')}
              className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-xl text-xs font-black text-gray-900 border border-gray-200 shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              {t('account:manage')} <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 rounded-[32px] border border-red-100 p-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-xl text-red-500 shadow-sm">
              <TriangleAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-red-900 mb-2 tracking-tight">{t('account:dangerZone')}</h3>
              <p className="text-red-700/80 text-sm font-medium mb-6 leading-relaxed">
                {t('account:deleteWarning')}
              </p>
              <button 
                className="flex items-center gap-2 px-6 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors shadow-sm"
                onClick={() => {
                  if(confirm(t('account:deleteConfirm'))) {
                    // Delete logic
                  }
                }}
              >
                <Trash2 size={16} /> {t('account:deleteAccount')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Install Modal */}
      {shortcutData && (
        <InstallShortcutModal
          isOpen={showShortcutModal}
          onClose={() => setShowShortcutModal(false)}
          apiToken={shortcutData.api_token}
          shortcutUrl={shortcutData.shortcut_url}
        />
      )}
    </div>
  );
};