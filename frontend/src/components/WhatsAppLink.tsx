import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Copy, Loader2, MessageCircle, RefreshCw, XCircle } from 'lucide-react';
import { API_BASE } from '../utils/api';

const RECOLEKT_WHATSAPP_DISPLAY = '+1 555 674 1760';
const RECOLEKT_WHATSAPP_COPY = '+15556741760';
const RECOLEKT_WHATSAPP_WA_ME = '15556741760';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

type LinkState = 'idle' | 'generating' | 'waiting' | 'linked' | 'expired' | 'error';

interface WhatsAppLinkProps {
  onLinked?: () => void;
  authToken: string;
}

export const WhatsAppLink: React.FC<WhatsAppLinkProps> = ({ onLinked, authToken }) => {
  const [state, setState] = useState<LinkState>('idle');
  const [pin, setPin] = useState('');
  const [expiresIn, setExpiresIn] = useState(900);
  const [copied, setCopied] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);

  useEffect(() => {
    if (state !== 'waiting' || expiresIn <= 0) return;
    const t = setTimeout(() => setExpiresIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, expiresIn]);

  useEffect(() => {
    if (expiresIn <= 0 && state === 'waiting') {
      setState('expired');
    }
  }, [expiresIn, state]);

  useEffect(() => {
    if (state !== 'waiting') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/whatsapp/link-status'), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (data.linked) {
          setState('linked');
          clearInterval(interval);
          onLinked?.();
        }
      } catch {
        // Keep polling while the PIN is active.
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [state, authToken, onLinked]);

  const generatePin = useCallback(async () => {
    setState('generating');
    try {
      const res = await fetch(joinUrl(API_BASE, '/api/auth/whatsapp/generate-pin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await res.json();
      if (data.pin) {
        setPin(data.pin);
        setExpiresIn(data.expires_in || 900);
        setState('waiting');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  }, [authToken]);

  const copyPin = async () => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permissions can fail; the visible PIN remains copyable.
    }
  };

  const copyWhatsAppNumber = async () => {
    try {
      await navigator.clipboard.writeText(RECOLEKT_WHATSAPP_COPY);
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    } catch {
      // Clipboard permissions can fail; the visible number remains copyable.
    }
  };

  const openWhatsApp = () => {
    navigator.clipboard.writeText(pin).catch(() => {});
    window.open(`https://wa.me/${RECOLEKT_WHATSAPP_WA_ME}?text=${encodeURIComponent(pin)}`, '_blank');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (state === 'linked') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
          <CheckCircle size={32} className="text-green-500" />
        </div>
        <h3 className="text-xl font-black text-gray-900">WhatsApp linked!</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          You can now save reels by sending Instagram links to Recolekt on WhatsApp.
        </p>
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 py-6 text-center max-w-sm mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <MessageCircle size={20} className="text-white" />
          </div>
          <div className="h-0.5 w-8 bg-gray-200 rounded-full" />
          <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-black">R</span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-black text-gray-900 mb-1">Confirm your access</h3>
          <p className="text-gray-500 text-sm">Follow these steps to link your WhatsApp</p>
        </div>

        <div className="w-full rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          Message Recolekt on WhatsApp: {RECOLEKT_WHATSAPP_DISPLAY}
        </div>

        <ol className="text-sm text-gray-600 text-left space-y-2 w-full">
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <span>Copy your PIN below.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <span>Open WhatsApp and start a chat with {RECOLEKT_WHATSAPP_DISPLAY}.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <span>Send only this PIN: {pin}</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
            <span>Come back here — we'll detect it automatically.</span>
          </li>
        </ol>

        <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-5 px-6 flex flex-col items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Your PIN</span>
          <span className="font-mono text-4xl font-black tracking-[0.4em] text-gray-900">
            {pin}
          </span>
          <span className="text-xs text-gray-400">Expires in {formatTime(expiresIn)}</span>
        </div>

        <div className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left">
          <label className="block text-xs text-gray-400 uppercase tracking-widest font-bold mb-2">
            Message to send
          </label>
          <div className="font-mono text-lg font-black text-gray-900 break-all">{pin}</div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={openWhatsApp}
            className="w-full flex items-center justify-center gap-2 py-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl text-sm transition-colors"
          >
            <MessageCircle size={18} />
            Copy PIN & open WhatsApp
          </button>
          <button
            onClick={copyPin}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
          >
            {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy PIN only'}
          </button>
          <button
            onClick={copyWhatsAppNumber}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
          >
            {copiedNumber ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
            {copiedNumber ? 'Number copied!' : 'Copy WhatsApp number'}
          </button>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          If WhatsApp does not open automatically, open WhatsApp manually and send the PIN to {RECOLEKT_WHATSAPP_DISPLAY}.
        </p>

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          Waiting for your WhatsApp message...
        </div>
      </div>
    );
  }

  if (state === 'expired') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center">
          <XCircle size={32} className="text-orange-400" />
        </div>
        <h3 className="text-xl font-black text-gray-900">PIN expired</h3>
        <p className="text-gray-500 text-sm">Your PIN expired after 15 minutes.</p>
        <button
          onClick={generatePin}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-xl text-sm"
        >
          <RefreshCw size={16} />
          Generate new PIN
        </button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <XCircle size={32} className="text-red-400" />
        </div>
        <h3 className="text-xl font-black text-gray-900">Something went wrong</h3>
        <button
          onClick={generatePin}
          className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-bold rounded-xl text-sm"
        >
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
        <MessageCircle size={28} className="text-white" />
      </div>
      <div>
        <h3 className="text-xl font-black text-gray-900 mb-2">Link WhatsApp</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          Save reels by sending links to Recolekt on WhatsApp.
        </p>
      </div>
      <button
        onClick={generatePin}
        disabled={state === 'generating'}
        className="flex items-center gap-2 px-8 py-4 bg-green-500 hover:bg-green-600 text-white font-black rounded-xl shadow-lg disabled:opacity-50 text-base transition-colors"
      >
        {state === 'generating' ? (
          <><Loader2 size={18} className="animate-spin" /> Generating...</>
        ) : (
          <><MessageCircle size={18} /> Link WhatsApp</>
        )}
      </button>
    </div>
  );
};
