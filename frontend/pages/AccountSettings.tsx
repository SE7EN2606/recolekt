import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';

export const AccountSettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, isAuthenticated } = useAuth();
  
  const [email, setEmail] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);

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

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const displayName = user.name || 'User';
  const displayHandle = user.email.split('@')[0];

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

          {/* Corrected Save Changes Button Size */}
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