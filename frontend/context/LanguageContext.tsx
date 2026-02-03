import React, { createContext, useContext, useState, useCallback } from 'react';

interface LanguageContextType {
  showOriginal: boolean;
  toggleLanguage: () => void;
  t: (data: any) => any;
  languageCode: string;
  setLanguageCode: (code: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const isPlainObject = (v: any) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

// Try to extract a "best" string from an object (common shapes in your app)
const extractText = (v: any): string => {
  if (typeof v === 'string') return v;
  if (!v) return '';

  // If it is a {english, original} wrapper, unwrap first (caller decides which branch)
  if (isPlainObject(v) && (v.english !== undefined || v.original !== undefined)) {
    // Return empty here; unwrapping is handled in t() so showOriginal is respected.
    return '';
  }

  if (isPlainObject(v)) {
    // Common keys in your payloads
    const keys = ['summary', 'text', 'headline', 'title', 'description', 'value', 'content', 'name'];
    for (const k of keys) {
      if (typeof v[k] === 'string' && v[k].trim()) return v[k];
    }
  }

  return '';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [languageCode, setLanguageCode] = useState('FR');

  const toggleLanguage = useCallback(() => {
    setShowOriginal(prev => {
      console.log('🌍 Language Toggle:', prev ? 'EN' : 'ORIGINAL');
      return !prev;
    });
  }, []);

  const t = useCallback((data: any): any => {
    if (!data) return '';

    // Strings pass through
    if (typeof data === 'string') return data;

    // Arrays: translate each entry
    if (Array.isArray(data)) {
      return data.map(item => t(item));
    }

    // Handle { english, original } wrappers (can contain strings OR objects)
    if (isPlainObject(data) && (data.english !== undefined || data.original !== undefined)) {
      const picked = showOriginal
        ? (data.original ?? data.english ?? '')
        : (data.english ?? data.original ?? '');

      // If picked is a string -> done
      if (typeof picked === 'string') return picked;

      // If picked is an array -> translate recursively
      if (Array.isArray(picked)) return picked.map(item => t(item));

      // If picked is an object -> try to extract meaningful text;
      // if no direct text, return the object translated field-by-field (so UI can use it safely).
      if (isPlainObject(picked)) {
        const direct = extractText(picked);
        if (direct) return direct;

        // Translate object values recursively
        const out: any = {};
        for (const [k, v] of Object.entries(picked)) {
          out[k] = t(v);
        }
        return out;
      }

      return safeStr(picked);
    }

    // Plain objects: translate each field (so nested english/original fields inside are handled)
    if (isPlainObject(data)) {
      const out: any = {};
      for (const [k, v] of Object.entries(data)) {
        out[k] = t(v);
      }
      return out;
    }

    // Numbers/booleans/etc.
    return safeStr(data);
  }, [showOriginal]);

  return (
    <LanguageContext.Provider value={{ showOriginal, toggleLanguage, t, languageCode, setLanguageCode }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};
