import { API_BASE } from "../utils/api";
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '../components/Button';

export const BillingSuccess: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6">
      <style>{`
        @keyframes celebrate {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-celebrate { animation: celebrate 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
      
      <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-8 animate-celebrate">
        <CheckCircle2 size={48} strokeWidth={2.5} />
      </div>

      <h1 className="text-4xl font-black text-gray-900 mb-4">You're Pro!</h1>
      <p className="text-gray-500 text-lg max-w-sm mx-auto mb-10 leading-relaxed">
        Welcome to the premium experience. Your account has been upgraded and you now have unlimited pins.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button onClick={() => navigate('/gallery')} className="h-[56px] text-lg font-bold gap-2">
          Start Pinning <Sparkles size={20} />
        </Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Go to Home
        </Button>
      </div>
    </div>
  );
};
