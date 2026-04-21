import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Infinity, Search, Bot, FolderOpen, Check, HelpCircle, ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '../components/Button';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

export const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleAction = () => {
    if (user) {
      // User is logged in, go to payment simulation
      navigate('/subscribe');
    } else {
      // User is guest, go to auth then gallery
      navigate('/auth');
    }
  };

  const features = [
    { icon: <Infinity className="text-primary-600" />, title: "Unlimited Saves", desc: "Save unlimited articles, videos, and posts. Never worry about running out of space." },
    { icon: <Search className="text-primary-600" />, title: "AI-Powered Search", desc: "Find anything instantly with our intelligent search that understands natural language." },
    { icon: <Bot className="text-primary-600" />, title: "Smart Organization", desc: "Let AI automatically categorize and tag your content for effortless organization." },
    { icon: <FolderOpen className="text-primary-600" />, title: "Custom Collections", desc: "Create beautiful collections to organize your saves exactly how you want." }
  ];

  const faqs = [
    { q: "Can I cancel anytime?", a: "Yes. You can cancel your subscription at any time from your settings. You will retain access until the end of your billing period." },
    { q: "Is there a free version?", a: "Absolutely. You can use Recolekt for free to save up to 50 videos and create 3 collections. Pro is for power users who want no limits." },
    { q: "Does this work with private accounts?", a: "No. We respect privacy. Recolekt only processes content from public URLs." }
  ];

  return (
    <div className="max-w-3xl mx-auto pb-20 animate-fade-in px-4 md:px-0">
      
      {/* Back Button - Only show if coming from within the app (user is logged in) */}
      {user && (
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors mb-10 font-black uppercase text-xs tracking-widest mt-8 md:mt-0"
        >
          <ArrowLeft size={18} /> Back
        </button>
      )}
      {!user && <div className="h-12 md:h-16" />} {/* Spacer for guests */}

      {/* Hero Section */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest mb-6 shadow-xl shadow-red-600/20">
          <Star size={12} fill="currentColor" /> PRO PLAN
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-gray-900 leading-tight">
          Unlock your full <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-purple-600">creative potential.</span>
        </h1>
        <p className="text-gray-500 font-medium text-lg leading-relaxed max-w-lg mx-auto mb-8">
          Remove all limits. Get AI-powered organization for every single video you discover.
        </p>
        
        {/* Social Proof */}
        <div className="flex items-center justify-center gap-4 py-4 bg-gray-50 rounded-2xl max-w-xs mx-auto border border-gray-100">
           <div className="flex -space-x-3">
             {[1,2,3].map(i => (
               <div key={i} className={`w-8 h-8 rounded-full border-2 border-white bg-gray-300 bg-[url('https://i.pravatar.cc/100?img=${i + 10}')] bg-cover`} />
             ))}
           </div>
           <div className="text-left">
             <div className="flex gap-0.5 text-yellow-400 mb-0.5">
               {[...Array(5)].map((_, i) => <Star key={i} size={10} fill="currentColor" />)}
             </div>
             <p className="text-[10px] font-black text-gray-900 uppercase tracking-wide">Trusted by 2,000+ Curators</p>
           </div>
        </div>
      </div>

      {/* Pricing Toggle Selection */}
      <div className="bg-white rounded-[40px] border border-gray-100 shadow-xl p-3 mb-16 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-400 via-purple-500 to-primary-400"></div>
        
        <div className="text-center py-6">
           <h2 className="text-lg font-black text-gray-900">Choose your cycle</h2>
           <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">7 Days Free Trial included</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button 
            onClick={() => setBillingCycle('monthly')}
            className={`p-6 rounded-[32px] border-2 transition-all relative text-left group ${billingCycle === 'monthly' ? 'border-primary-600 bg-primary-50/50 shadow-inner' : 'border-gray-100 bg-white hover:border-gray-200'}`}
          >
             <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black uppercase tracking-widest ${billingCycle === 'monthly' ? 'text-primary-700' : 'text-gray-400'}`}>Monthly</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${billingCycle === 'monthly' ? 'bg-primary-600 border-primary-600' : 'border-gray-200'}`}>
                  {billingCycle === 'monthly' && <Check size={12} className="text-white" strokeWidth={4} />}
                </div>
             </div>
             <div className="text-gray-900 text-3xl font-black tracking-tight">5,99 €<span className="text-gray-400 text-sm font-medium">/mo</span></div>
          </button>

          <button 
            onClick={() => setBillingCycle('yearly')}
            className={`p-6 rounded-[32px] border-2 transition-all relative text-left group ${billingCycle === 'yearly' ? 'border-green-500 bg-green-50/50 shadow-inner' : 'border-gray-100 bg-white hover:border-gray-200'}`}
          >
             <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-black px-3 py-1.5 rounded-full shadow-lg shadow-green-600/20 tracking-wider">BEST VALUE</div>
             <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black uppercase tracking-widest ${billingCycle === 'yearly' ? 'text-green-700' : 'text-gray-400'}`}>Annual</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${billingCycle === 'yearly' ? 'bg-green-600 border-green-600' : 'border-gray-200'}`}>
                  {billingCycle === 'yearly' && <Check size={12} className="text-white" strokeWidth={4} />}
                </div>
             </div>
             <div className="text-gray-900 text-3xl font-black tracking-tight">44,99 €<span className="text-gray-400 text-sm font-medium">/yr</span></div>
             <div className="text-[10px] font-bold text-green-600 mt-1">Save 37% vs Monthly</div>
          </button>
        </div>

        <div className="p-4">
           <Button 
             fullWidth 
             onClick={handleAction}
             className="bg-primary-600 hover:bg-primary-700 text-white py-6 text-xl font-black rounded-[24px] shadow-2xl shadow-primary-600/30 transition-transform active:scale-95"
           >
             {user ? 'Upgrade to Pro' : 'Start 7-Day Free Trial'}
           </Button>
           <p className="text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center justify-center gap-2">
             <ShieldCheck size={12} /> Secure payment via Stripe
           </p>
        </div>
      </div>

      {/* Feature List */}
      <div className="grid md:grid-cols-2 gap-6 mb-16">
        {features.map((f, i) => (
          <div key={i} className="flex gap-5 items-start p-6 rounded-3xl bg-white border border-gray-100 hover:border-primary-100 transition-colors">
            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
              {f.icon}
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-xs font-medium leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 justify-center mb-8">
          <HelpCircle className="text-gray-300" size={20} />
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Common Questions</h3>
        </div>
        
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden transition-all">
              <button 
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-bold text-gray-900 text-sm">{faq.q}</span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 pt-0">
                  <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-8 py-12 mt-8 border-t border-gray-100">
        <button className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors">Restore purchases</button>
        <button className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors">Terms</button>
        <button className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors">Privacy</button>
      </div>
    </div>
  );
};
