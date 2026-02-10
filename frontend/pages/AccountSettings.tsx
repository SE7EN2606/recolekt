import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, TriangleAlert, Download, Key, Smartphone, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth, getAuthHeaders } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || 'http://localhost:5001';

interface TokenInfo {
  has_token: boolean;
  prefix?: string;
  created_at?: string;
  last_used_at?: string;
}

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();
  
  const [email, setEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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
    const confirmed = confirm(
      'This will revoke your existing token and generate a new one. ' +
      'Any shortcuts using the old token will stop working. Continue?'
    );
    
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
      
      // Show token to user (only time they'll see it)
      const copyToken = confirm(
        `✅ Token Generated!\n\n${data.token}\n\n` +
        `This is the only time you'll see the full token.\n\n` +
        `Click OK to copy it to clipboard, or Cancel to continue without copying.`
      );
      
      if (copyToken) {
        await navigator.clipboard.writeText(data.token);
        alert('Token copied to clipboard!');
      }
      
      await fetchTokenInfo();
    } catch (error) {
      console.error('Failed to generate token:', error);
      alert('Failed to generate token. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadShortcut = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(`${API_BASE}/api_token/download-shortcut`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (response.status === 404) {
        const data = await response.json();
        if (data.action === 'generate_token') {
          const shouldGenerate = confirm(
            'You need an API token first.\n\n' +
            'Generate one now to download your personalized shortcut?'
          );
          if (shouldGenerate) {
            await generateToken();
            // After generating, try downloading again
            setTimeout(() => downloadShortcut(), 1000);
          }
        }
        return;
      }

      if (!response.ok) throw new Error('Failed to download shortcut');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Recolekt-SaveReel.shortcut';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(
        '✅ Shortcut Downloaded!\n\n' +
        'Open the file on your iPhone to install it.\n' +
        'Then share any Instagram reel → tap "Recolekt"'
      );
    } catch (error) {
      console.error('Failed to download shortcut:', error);
      alert('Failed to download shortcut. Please try again.');
    } finally {
      setIsDownloading(false);
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

  const InputField = ({ label, value, readOnly = false, onChange, action }: any) => (
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
          <h1 className="text-2xl font-bold text-gray-900">Personal Info</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your identity and billing details</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white md:rounded-3xl shadow-sm p-6 md:p-8 border border-gray-100">
          
          {/* Avatar Section */}
          <div className="flex items-center gap-5 mb-10 pb-10 border-b border-gray-50">
            <div className="w-16 h-16 bg-dark-900 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-lg overflow-hidden border-2 border-white">
              {user.picture ? (
                 <img 
                    src={user.picture} 
                    alt={displayName.toUpperCase()} 
                    className="w-full h-full object-cover" 
                 />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight uppercase">
                {displayName}
              </h2>
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Personal Account</p>
            </div>
          </div>

          <div className="space-y-2">
            <InputField label="Full Name" value={displayName.toUpperCase()} readOnly />
            
            <InputField 
              label="Email Address" 
              value={email} 
              readOnly={!isEditingEmail}
              onChange={(e: any) => setEmail(e.target.value)}
              action={
                <button 
                  onClick={() => setIsEditingEmail(!isEditingEmail)}
                  className={`px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all
                    ${isEditingEmail 
                      ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-600/20' 
                      : 'bg-white border-gray-200 text-gray-600 hover:border-primary-600 hover:text-primary-600 shadow-sm'}
                  `}
                >
                  {isEditingEmail ? 'Save' : 'Edit'}
                </button>
              }
            />

            <InputField label="Country" value="FRANCE" readOnly />
          </div>

          {/* Payment Section */}
          <div className="pt-10 border-t border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Payment Method</h3>
              <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full uppercase tracking-widest">Via Stripe</span>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 flex items-center justify-between group hover:border-primary-200 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-black italic text-[10px] text-gray-400 shadow-sm">VISA</div>
                <div>
                  <span className="block font-black text-gray-900 tracking-tight">•••• 4242</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Expires 12/26</span>
                </div>
              </div>
              <button 
                onClick={() => window.open('https://billing.stripe.com/p/login/test_portal', '_blank')}
                className="flex items-center gap-2 bg-white px-5 py-2.5 rounded-xl text-xs font-black text-gray-900 border border-gray-200 shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                Manage <ExternalLink size={14} />
              </button>
            </div>
          </div>

          <div className="pt-8">
            <Button 
              fullWidth 
              size="sm" 
              className="py-3 px-4 text-sm font-black rounded-xl shadow-lg shadow-primary-600/20" 
              onClick={() => navigate('/gallery')}
            >
              Save Changes
            </Button>
          </div>
        </div>

        {/* ✅ NEW: iOS Shortcuts Section */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 md:rounded-3xl border border-blue-100 p-6 md:p-8">
  <div className="flex items-center gap-4 mb-6">
    <div className="p-3 bg-white rounded-xl text-blue-600 shadow-sm">
      <Smartphone size={28} />
    </div>
    <div>
      <h3 className="text-xl font-black text-blue-900 tracking-tight">Save Reels from Instagram</h3>
      <p className="text-blue-700 text-sm font-medium mt-1">One-click iOS shortcut for your iPhone</p>
    </div>
  </div>
          {/* BIG DOWNLOAD BUTTON */}
          <button
            onClick={downloadShortcut}
            disabled={isDownloading}
            className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-blue-600 text-white rounded-2xl font-black text-base uppercase tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-6 h-6" />
                Download iOS Shortcut
              </>
            )}
          </button>

          {/* Simple Instructions */}
          <div className="bg-white rounded-2xl p-5 border border-blue-100">
            <h4 className="font-black text-blue-900 text-xs uppercase tracking-widest mb-3">How to Use:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 font-medium">
              <li>Click the button above</li>
              <li>Open the file on your iPhone</li>
              <li>Tap "Add Shortcut"</li>
              <li>Share any Instagram reel → "Recolekt" ✨</li>
            </ol>
          </div>
        </div>
        {/* Danger Zone */}
        <div className="bg-red-50 rounded-[32px] border border-red-100 p-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white rounded-xl text-red-500 shadow-sm">
              <TriangleAlert size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-red-900 mb-2 tracking-tight">Danger Zone</h3>
              <p className="text-red-700/80 text-sm font-medium mb-6 leading-relaxed">
                Deleting your account is permanent. All your videos, collections, and AI summaries will be erased immediately.
              </p>
              <button 
                className="flex items-center gap-2 px-6 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors shadow-sm"
                onClick={() => {
                  if(confirm("Are you sure you want to PERMANENTLY delete your account?")) {
                    // Delete logic
                  }
                }}
              >
                <Trash2 size={16} /> Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
