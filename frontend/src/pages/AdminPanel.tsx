import { API_BASE } from "../utils/api";
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, Send, CheckCircle, XCircle, Loader2, Shield, User, MessageCircle, ArrowLeft } from 'lucide-react';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

interface ApiResult {
  success: boolean;
  data?: any;
  error?: string;
}

export const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [igAccount, setIgAccount] = useState<{ id: string; username: string; account_type: string } | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [sendResult, setSendResult] = useState<ApiResult | null>(null);
  const [sending, setSending] = useState(false);
  const [recipientId, setRecipientId] = useState('3237495909747183');
  const [message, setMessage] = useState('✅ Test message from Recolekt — DM flow is working!');

  // Fetch @recolekt account info on mount (demonstrates instagram_business_basic)
  useEffect(() => {
    setLoadingAccount(true);
    fetch(joinUrl(API_BASE, '/api/auth/instagram/account-info'))
      .then(r => r.json())
      .then(d => {
        if (d.id) setIgAccount(d);
      })
      .catch(() => {})
      .finally(() => setLoadingAccount(false));
  }, []);

  const handleSendDM = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(joinUrl(API_BASE, '/api/auth/instagram/send-test-dm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, message })
      });
      const data = await res.json();
      setSendResult({ success: data.success, data, error: data.error?.message });
    } catch (e: any) {
      setSendResult({ success: false, error: e.message });
    }
    setSending(false);
  };

  const handleMetaLogin = () => {
    window.location.assign(joinUrl(API_BASE, '/api/auth/instagram/login'));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Recolekt Admin Panel</h1>
            <p className="text-sm text-gray-400">Meta App Review — Instagram Integration</p>
          </div>
        </div>

        {/* Step 1 — Meta OAuth Login */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-black flex items-center justify-center">1</div>
            <div>
              <h2 className="font-black text-gray-900">Meta OAuth Login</h2>
              <p className="text-xs text-gray-400">Authorize the app with Instagram Business permissions</p>
            </div>
          </div>
          <button
            onClick={handleMetaLogin}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
          >
            <Instagram size={18} />
            Connect with Instagram Business Account
          </button>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Grants: instagram_basic, instagram_manage_messages, pages_show_list
          </p>
        </div>

        {/* Step 2 — Verify @recolekt Account (demonstrates instagram_business_basic) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-black flex items-center justify-center">2</div>
            <div>
              <h2 className="font-black text-gray-900">Verify Instagram Business Account</h2>
              <p className="text-xs text-gray-400">Uses instagram_business_basic to confirm @recolekt identity</p>
            </div>
          </div>

          {loadingAccount && (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
              <Loader2 size={16} className="animate-spin" />
              Fetching account info...
            </div>
          )}

          {igAccount && (
            <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full flex items-center justify-center">
                <Instagram size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="font-black text-gray-900">@{igAccount.username}</p>
                <p className="text-xs text-gray-500">ID: {igAccount.id}</p>
                <p className="text-xs text-green-600 font-bold">{igAccount.account_type} Account ✓</p>
              </div>
              <CheckCircle size={20} className="text-green-500" />
            </div>
          )}

          {!loadingAccount && !igAccount && (
            <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
              <User size={16} />
              Complete Meta login above to verify account
            </div>
          )}

          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 font-mono">
              GET /me?fields=id,username,account_type → confirms @recolekt is a valid Instagram Business account
            </p>
          </div>
        </div>

        {/* Step 3 — Send Test DM (demonstrates instagram_manage_messages) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-black flex items-center justify-center">3</div>
            <div>
              <h2 className="font-black text-gray-900">Send Test DM</h2>
              <p className="text-xs text-gray-400">Uses instagram_business_manage_messages to send a reply DM</p>
            </div>
          </div>

          {/* Asset selection — shows Page/account */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <Instagram size={14} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">@recolekt</p>
              <p className="text-[10px] text-gray-400">Instagram Business Account • Page ID: 852014951320759</p>
            </div>
            <CheckCircle size={16} className="text-green-500" />
          </div>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Recipient Instagram ID</label>
              <input
                type="text"
                value={recipientId}
                onChange={e => setRecipientId(e.target.value)}
                className="w-full mt-1 bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 focus:ring-purple-100"
                placeholder="Instagram sender ID"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Message</label>
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full mt-1 bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-4 text-sm outline-none focus:ring-2 focus:ring-purple-100"
                placeholder="Message to send"
              />
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={handleSendDM}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sending ? 'Sending...' : 'Send DM from @recolekt'}
          </button>

          {/* Result */}
          {sendResult && (
            <div className={`mt-3 p-4 rounded-xl border ${sendResult.success ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                {sendResult.success
                  ? <CheckCircle size={16} className="text-green-500" />
                  : <XCircle size={16} className="text-red-500" />
                }
                <span className={`text-sm font-bold ${sendResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {sendResult.success ? 'Message sent successfully!' : 'Send failed'}
                </span>
              </div>
              {sendResult.success && (
                <p className="text-xs text-green-600">
                  Message ID: {sendResult.data?.result?.message_id?.substring(0, 40)}...
                </p>
              )}
              {sendResult.error && (
                <p className="text-xs text-red-600">{sendResult.error}</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3 text-center">
            After sending, check Instagram DMs on the recipient's device to confirm delivery
          </p>
        </div>

        {/* Step 4 — How it works for end users */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-black flex items-center justify-center">4</div>
            <div>
              <h2 className="font-black text-gray-900">End User Flow</h2>
              <p className="text-xs text-gray-400">How real users save reels via Instagram DM</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { icon: User, text: 'User creates a Recolekt account at recolekt.app' },
              { icon: Shield, text: 'User links their Instagram by DMing a PIN to @recolekt' },
              { icon: Instagram, text: 'User finds a reel on Instagram and forwards it to @recolekt via DM' },
              { icon: MessageCircle, text: '@recolekt replies: "✅ Got it! Saving this reel to your Recolekt library..."' },
              { icon: CheckCircle, text: 'Reel appears in user\'s Recolekt gallery with AI-generated title and summary' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-gray-500" />
                </div>
                <p className="text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
