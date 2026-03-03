import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, TriangleAlert, Loader2, SquarePen, Check } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { InstallShortcutModal } from '../components/InstallShortcutModal';
import shortcutsIcon from '/assets/shortcuts_icon.png';
import { useTranslation } from 'react-i18next';

interface TokenInfo {
  has_token: boolean;
  prefix?: string;
  created_at?: string;
  last_used_at?: string;
}

const COUNTRIES = [
  "United States", "United Kingdom", "France", "Canada", "Germany", "Australia", 
  "Afghanistan", "Albania", "Algeria", "American Samoa", "Andorra", "Angola", 
  "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", 
  "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", 
  "Belarus", "Belgium", "Belize", "Benin", "Bermuda", "Bhutan", "Bolivia", 
  "Bosnia and Herzegovina", "Botswana", "Bouvet Island", "Brazil", "British Indian Ocean Territory", 
  "Brunei Darussalam", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", 
  "Cape Verde", "Cayman Islands", "Central African Republic", "Chad", "Chile", "China", 
  "Christmas Island", "Cocos (Keeling) Islands", "Colombia", "Comoros", "Congo", 
  "Congo, The Democratic Republic of The", "Cook Islands", "Costa Rica", "Cote D'ivoire", 
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", 
  "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", 
  "Estonia", "Ethiopia", "Falkland Islands (Malvinas)", "Faroe Islands", "Fiji", "Finland", 
  "French Guiana", "French Polynesia", "French Southern Territories", "Gabon", "Gambia", 
  "Georgia", "Germany", "Ghana", "Gibraltar", "Greece", "Greenland", "Grenada", "Guadeloupe", 
  "Guam", "Guatemala", "Guinea", "Guinea-bissau", "Guyana", "Haiti", 
  "Heard Island and Mcdonald Islands", "Holy See (Vatican City State)", "Honduras", "Hong Kong", 
  "Hungary", "Iceland", "India", "Indonesia", "Iran, Islamic Republic of", "Iraq", "Ireland", 
  "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", 
  "Korea, Democratic People's Republic of", "Korea, Republic of", "Kuwait", "Kyrgyzstan", 
  "Lao People's Democratic Republic", "Latvia", "Lebanon", "Lesotho", "Liberia", 
  "Libyan Arab Jamahiriya", "Liechtenstein", "Lithuania", "Luxembourg", "Macao", 
  "Macedonia, The Former Yugoslav Republic of", "Madagascar", "Malawi", "Malaysia", "Maldives", 
  "Mali", "Malta", "Marshall Islands", "Martinique", "Mauritania", "Mauritius", "Mayotte", 
  "Mexico", "Micronesia, Federated States of", "Moldova, Republic of", "Monaco", "Mongolia", 
  "Montserrat", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", 
  "Netherlands Antilles", "New Caledonia", "New Zealand", "Nicaragua", "Niger", "Nigeria", 
  "Niue", "Norfolk Island", "Northern Mariana Islands", "Norway", "Oman", "Pakistan", "Palau", 
  "Palestinian Territory, Occupied", "Panama", "Papua New Guinea", "Paraguay", "Peru", 
  "Philippines", "Pitcairn", "Poland", "Portugal", "Puerto Rico", "Qatar", "Reunion", "Romania", 
  "Russian Federation", "Rwanda", "Saint Helena", "Saint Kitts and Nevis", "Saint Lucia", 
  "Saint Pierre and Miquelon", "Saint Vincent and The Grenadines", "Samoa", "San Marino", 
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia and Montenegro", "Seychelles", 
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", 
  "South Georgia and The South Sandwich Islands", "Spain", "Sri Lanka", "Sudan", "Suriname", 
  "Svalbard and Jan Mayen", "Swaziland", "Sweden", "Switzerland", "Syrian Arab Republic", 
  "Taiwan, Province of China", "Tajikistan", "Tanzania, United Republic of", "Thailand", 
  "Timor-leste", "Togo", "Tokelau", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", 
  "Turkmenistan", "Turks and Caicos Islands", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", 
  "United Kingdom", "United States", "United States Minor Outlying Islands", "Uruguay", 
  "Uzbekistan", "Vanuatu", "Venezuela", "Viet Nam", "Virgin Islands, British", 
  "Virgin Islands, U.S.", "Wallis and Futuna", "Western Sahara", "Yemen", "Zambia", "Zimbabwe"
];

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();
  const { t } = useTranslation(['account', 'common']);
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [showShortcutModal, setShowShortcutModal] = useState(false);
  const [shortcutData, setShortcutData] = useState<any>(null);
  const [isLoadingShortcut, setIsLoadingShortcut] = useState(false);

  // ✅ Bulletproof image fallback state
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setName(user.name || '');
    }
    window.scrollTo(0, 0);
  }, [user]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) fetchTokenInfo();
  }, [user]);

  useEffect(() => {
    if (!country) {
      fetch('https://ipapi.co/json/')
        .then(res => res.json())
        .then(data => setCountry(data.country_name || t('account:unknown')))
        .catch(() => setCountry(t('account:unknown')));
    }
  }, [t, country]);

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
      const copyToken = confirm(`${t('account:tokenGenerated')}\n\n${data.token}\n\n${t('account:tokenWarning')}`);
      
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

  const handleSaveInfo = async () => {
    setIsEditing(false);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const displayName = user.name || 'User';

  return (
    <div className="w-full pt-4 md:pt-0 pb-0 md:pb-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:gap-6 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('account:personalInfo')}</h1>
          <p className="text-gray-500 text-xs md:text-sm mt-1">{t('account:manageIdentity')}</p>
        </div>
      </div>

      <div className="space-y-5 md:space-y-6">
        
        {/* Personal Info Card */}
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm p-5 md:p-8 border border-gray-100">
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-50">
            <div className="flex items-center gap-4 md:gap-5">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-primary-600 to-primary-700 rounded-full flex items-center justify-center text-white text-lg md:text-2xl font-black shadow-lg overflow-hidden border-2 border-white">
                {/* ✅ FIXED: If the image breaks or doesn't exist, instantly show the letter */}
                {user.picture && !imgError ? (
                  <img 
                    src={user.picture.replace('http://', 'https://')} 
                    alt={displayName} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <h2 className="text-lg md:text-2xl font-black text-gray-900 tracking-tight uppercase truncate max-w-[200px] md:max-w-[300px]">
                {name || displayName}
              </h2>
            </div>

            <button 
              onClick={() => isEditing ? handleSaveInfo() : setIsEditing(true)}
              className="flex items-center gap-2 bg-white border border-gray-200 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-primary-600 font-black text-xs uppercase shadow-sm hover:bg-primary-50 hover:border-primary-200 transition-all active:scale-95"
            >
              {isEditing ? (
                <><Check size={16} /><span className="hidden md:inline">{t('account:done')}</span></>
              ) : (
                <><SquarePen size={16} /><span className="hidden md:inline">{t('account:edit')}</span></>
              )}
            </button>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            <div className="border-b border-gray-50 pb-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('account:fullName')}</label>
              <input 
                value={name} 
                readOnly={!isEditing} 
                onChange={(e) => setName(e.target.value)}
                className={`w-full bg-transparent text-lg md:text-xl font-black outline-none transition-colors mt-1 ${isEditing ? 'text-primary-600 border-b-2 border-primary-100 pb-1' : 'text-gray-900 border-none'}`}
              />
            </div>
            
            <div className="border-b border-gray-50 pb-4">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('account:emailAddress')}</label>
              <input 
                value={email} 
                readOnly={!isEditing} 
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-transparent text-lg md:text-xl font-black outline-none transition-colors mt-1 ${isEditing ? 'text-primary-600 border-b-2 border-primary-100 pb-1' : 'text-gray-900 border-none'}`}
              />
            </div>
            
            <div className="pb-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('account:country')}</label>
              {isEditing ? (
                <div className="relative mt-2 max-w-sm">
                  <select 
                    value={country} 
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full appearance-none bg-gray-50 border border-gray-100 rounded-xl p-3 text-base font-black text-primary-600 outline-none focus:ring-4 focus:ring-primary-100 transition-all cursor-pointer"
                  >
                    <option value="" disabled>Select Country</option> 
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary-400">
                    <SquarePen size={18} />
                  </div>
                </div>
              ) : (
                <div className="text-lg md:text-xl font-black text-gray-900 mt-1">{country}</div>
              )}
            </div>
          </div>
        </div>

        {/* iOS/macOS Shortcuts Section */}
        <div className="bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 rounded-2xl md:rounded-3xl border border-purple-100/50 p-5 md:p-8 shadow-sm">
          <div className="flex items-start gap-3 md:gap-4 mb-5 md:mb-6">
            <img src={shortcutsIcon} alt="Recolekt Shortcut" className="w-12 h-12 md:w-14 md:h-14 rounded-2xl shadow-lg" />
            <div className="flex-1">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight mb-1">{t('account:shortcutTitle')}</h3>
              <p className="text-xs md:text-sm text-gray-600 font-medium">{t('account:shortcutDesc')}</p>
            </div>
          </div>

          <button onClick={handleInstallShortcut} disabled={isLoadingShortcut} className="inline-flex items-center justify-center rounded-xl font-black uppercase tracking-widest transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-600/20 w-full px-6 md:px-8 py-4 md:py-5 text-sm md:text-base mb-5 md:mb-6">
            {isLoadingShortcut ? (
              <><Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin mr-3" />{t('common:loading')}</>
            ) : (
              <><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 md:w-6 md:h-6 mr-3"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>{t('account:installShortcut')}</>
            )}
          </button>

          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/50">
            <h4 className="font-bold text-gray-900 text-[11px] md:text-xs uppercase tracking-wider mb-3 flex items-center gap-2"><span className="w-1 h-4 bg-gradient-to-b from-[#8b5cf6] to-[#7c3aed] rounded-full"></span>{t('account:howToUse')}</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-xs md:text-sm text-gray-700 font-medium">
              <li>{t('account:step1')}</li>
              <li>{t('account:step2')}</li>
              <li>{t('account:step3')}</li>
              <li>{t('account:step4')}</li>
              <li>{t('account:step5')}</li>
            </ol>
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm p-5 md:p-8 border border-gray-100">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{t('account:paymentMethod')}</h3>
            <span className="text-[10px] font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full uppercase tracking-widest">{t('account:viaStripe')}</span>
          </div>
          
          <div className="p-4 md:p-6 bg-gray-50 rounded-2xl md:rounded-3xl border border-gray-100 flex items-center justify-between group hover:border-primary-200 transition-colors">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-10 h-7 md:w-12 md:h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-black italic text-[9px] md:text-[10px] text-gray-400 shadow-sm">VISA</div>
              <div><span className="block font-black text-gray-900 tracking-tight text-sm md:text-base">•••• 4242</span><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('account:expires')} 12/26</span></div>
            </div>
            <button onClick={() => window.open('https://billing.stripe.com/p/login/test_portal', '_blank')} className="flex items-center gap-2 bg-white px-4 md:px-5 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs font-black text-gray-900 border border-gray-200 shadow-sm hover:shadow-md transition-all active:scale-95">
              {t('account:manage')} <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Danger Zone: Centered */}
        <div className="bg-red-50 rounded-2xl md:rounded-[32px] border border-red-100 p-8 flex flex-col items-center text-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-white rounded-xl text-red-500 shadow-sm"><TriangleAlert size={24} /></div>
            <h3 className="text-lg md:text-xl font-black text-red-900 m-0 tracking-tight">{t('account:dangerZone')}</h3>
          </div>
          <p className="text-red-700/80 text-xs md:text-sm font-medium mb-8 max-w-md leading-relaxed">{t('account:deleteWarning')}</p>
          <button className="flex items-center gap-2 px-10 py-3.5 bg-white border border-red-200 text-red-600 rounded-xl font-black text-sm hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-95">
            <Trash2 size={18} /> {t('account:deleteAccount')}
          </button>
        </div>

      </div>

      {shortcutData && (
        <InstallShortcutModal isOpen={showShortcutModal} onClose={() => setShowShortcutModal(false)} apiToken={shortcutData.api_token} shortcutUrl={shortcutData.shortcut_url} />
      )}
    </div>
  );
};