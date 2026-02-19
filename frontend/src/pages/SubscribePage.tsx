import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';

export const SubscribePage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate a redirect to Stripe and back after 2.5 seconds
    const timer = setTimeout(() => {
      navigate('/billing/success');
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-8">
        <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 animate-pulse">
          <Lock size={32} />
        </div>
        <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-lg border border-gray-100">
          <Loader2 size={24} className="text-primary-600 animate-spin" />
        </div>
      </div>

      <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">
        Connecting to Secure Checkout
      </h1>
      <p className="text-gray-500 font-medium">
        Redirecting you to our payment partner...
      </p>

      <div className="mt-12 flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-widest">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-ping"></span>
        Encrypted Connection Active
      </div>
    </div>
  );
};
