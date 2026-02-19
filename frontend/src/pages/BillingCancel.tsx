import React from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { Button } from '../components/Button';

export const BillingCancel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6">
      <div className="w-20 h-20 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-8">
        <XCircle size={40} />
      </div>

      <h1 className="text-3xl font-black text-gray-900 mb-4">Upgrade Cancelled</h1>
      <p className="text-gray-500 text-lg max-w-sm mx-auto mb-10 leading-relaxed">
        No changes were made to your account. You're still on the free plan.
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button onClick={() => navigate('/billing')} className="h-[56px] text-lg font-bold">
          Try Again
        </Button>
        <Button variant="ghost" onClick={() => navigate('/settings')}>
          Back to Settings
        </Button>
      </div>
    </div>
  );
};
