import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Settings, LogOut, X } from 'lucide-react';
import { AuthModal } from './AuthModal'; // NEW AuthModal

export const ProfileMenu = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { user, signOut, loading, isAuthenticated } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <>
      {/* Profile Menu */}
      <div className="fixed top-16 right-4 md:right-6 w-80 bg-white rounded-3xl shadow-2xl border border-gray-100 z-[9998] animate-in slide-in-from-top-4 duration-200">
        <div className="p-6">
          {isAuthenticated && user ? (
            <>
              <div className="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-2xl">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-lg text-gray-900">{user.name || user.email}</p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              </div>
              
              <div className="space-y-2 mb-6">
                <button
                  onClick={() => {
                    onClose();
                    navigate('/settings/account');
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 transition-all group"
                >
                  <Settings className="w-5 h-5 text-gray-500 group-hover:text-primary-600" />
                  <span className="font-medium text-gray-900">Account Settings</span>
                </button>
              </div>

              <button
                onClick={async () => {
                  await signOut();
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-4 text-red-600 hover:bg-red-50 rounded-2xl transition-all font-medium"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white py-4 px-6 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Sign In'}
              </button>
              <button
                onClick={() => {
                  setIsAuthModalOpen(true);
                }}
                className="w-full text-primary-600 font-bold text-lg py-4 px-6 border-2 border-primary-200 rounded-2xl hover:bg-primary-50 hover:border-primary-300 transition-all"
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </>
  );
};
