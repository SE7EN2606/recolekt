import React, { useState, useEffect, useCallback } from 'react';
import { Instagram, Copy, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE } from '../utils/api';

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

type LinkState = 'idle' | 'generating' | 'waiting' | 'linked' | 'expired' | 'error';

interface InstagramLinkProps {
  onLinked?: () => void;
  authToken: string;
}

export const InstagramLink: React.FC<InstagramLinkProps> = ({ onLinked, authToken }) => {
  const [state, setState] = useState<LinkState>('idle');
  const [pin, setPin] = useState('');
  const [expiresIn, setExpiresIn] = useState(900);
  const [copied, setCopied] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Countdown timer
  useEffect(() => {
    if (state !== 'waiting' || expiresIn <= 0) return;
    const t = setTimeout(() => setExpiresIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, expiresIn]);

  useEffect(() => {
    if (expiresIn <= 0 && state === 'waiting') {
      setState('expired');
    }
  }, [expiresIn, state]);

  // Poll for link confirmation every 3 seconds
  useEffect(() => {
    if (state !== 'waiting') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(joinUrl(API_BASE, '/api/auth/instagram/link-status'), {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.linked) {
          setState('linked');
          clearInterval(interval);
          onLinked?.();
        }
        setPollCount(c => c + 1);
      } catch {
        // keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [state, authToken, onLinked]);

  const generatePin = useCallback(async () => {
    setState('generating');
    try {
      const res = await fetch(joinUrl(API_BASE, '/api/auth/instagram/generate-pin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        }
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
      // fallback: select text
    }
  };

  const openInstagram = () => {
    // Copy PIN then open Instagram DMs
    navigator.clipboard.writeText(pin).catch(() => {});
    window.open('instagram://direct-v2', '_blank') ||
    window.open('https://www.instagram.com/direct/t/recolekt', '_blank');
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── LINKED ──
  if (state === 'linked') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
          <CheckCircle size={32} className="text-green-500" />
        </div>
        <h3 className="text-xl font-black text-gray-900">Instagram linked!</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          You can now save reels by DMing any reel URL to{' '}
          <span className="font-bold text-gray-800">@recolekt</span> on Instagram.
        </p>
      </div>
    );
  }

  // ── WAITING FOR DM ──
  if (state === 'waiting') {
    return (
      <div className="flex flex-col items-center gap-6 py-6 text-center max-w-sm mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
            <Instagram size={20} className="text-white" />
          </div>
          <div className="h-0.5 w-8 bg-gray-200 rounded-full" />
          <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-black">R</span>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-black text-gray-900 mb-1">Confirm your access</h3>
          <p className="text-gray-500 text-sm">Follow these steps to link your Instagram</p>
        </div>

        {/* Steps */}
        <ol className="text-sm text-gray-600 text-left space-y-2 w-full">
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <span>Copy the PIN below and open Instagram</span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
            <span>Send the PIN as a DM to <span className="font-bold text-gray-900">@recolekt</span></span>
          </li>
          <li className="flex gap-3">
            <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
            <span>Come back here — we'll detect it automatically</span>
          </li>
        </ol>

        {/* PIN display */}
        <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-5 px-6 flex flex-col items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Your PIN</span>
          <span className="font-mono text-4xl font-black tracking-[0.4em] text-gray-900">
            {pin}
          </span>
          <span className="text-xs text-gray-400">
            Expires in {formatTime(expiresIn)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={openInstagram}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-bold rounded-xl text-sm"
          >
            <Instagram size={18} />
            Copy PIN & open Instagram
          </button>
          <button
            onClick={copyPin}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
          >
            {copied ? <CheckCircle size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy PIN only'}
          </button>
        </div>

        {/* Waiting indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          Waiting for your DM...
        </div>

        <p className="text-xs text-gray-400 max-w-xs">
          We'll only ask you to do this once to securely link your account.
        </p>
      </div>
    );
  }

  // ── EXPIRED ──
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

  // ── ERROR ──
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

  // ── IDLE / GENERATING ──
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full flex items-center justify-center">
        <Instagram size={28} className="text-white" />
      </div>
      <div>
        <h3 className="text-xl font-black text-gray-900 mb-2">Link your Instagram</h3>
        <p className="text-gray-500 text-sm max-w-xs">
          Save reels instantly by DMing any reel URL to{' '}
          <span className="font-bold text-gray-800">@recolekt</span> on Instagram.
        </p>
      </div>
      <button
        onClick={generatePin}
        disabled={state === 'generating'}
        className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white font-black rounded-xl shadow-lg disabled:opacity-50 text-base"
      >
        {state === 'generating' ? (
          <><Loader2 size={18} className="animate-spin" /> Generating...</>
        ) : (
          <><Instagram size={18} /> Link Instagram</>
        )}
      </button>
    </div>
  );
};
