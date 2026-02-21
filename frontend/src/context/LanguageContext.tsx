import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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

  // If it is a {english, original} wrapper, unwrap first
  if (isPlainObject(v) && (v.english !== undefined || v.original !== undefined)) {
    return '';
  }

  if (isPlainObject(v)) {
    const keys = ['summary', 'text', 'headline', 'title', 'description', 'value', 'content', 'name'];
    for (const k of keys) {
      if (typeof v[k] === 'string' && v[k].trim()) return v[k];
    }
  }

  return '';
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();

  // 🔥 STATE: Initialize based on the i18next current language
  const [showOriginal, setShowOriginal] = useState(i18n.language.startsWith('fr'));
  const [languageCode, setLanguageCode] = useState(i18n.language.toUpperCase());

  // 🔥 EFFECT: When the App Language changes (via i18n), sync the content preference
  useEffect(() => {
    const isFr = i18n.language.startsWith('fr');
    setShowOriginal(isFr);
    setLanguageCode(isFr ? 'FR' : 'EN');
    console.log('🌍 App Language changed to:', i18n.language, 'Setting content to Original:', isFr);
  }, [i18n.language]);

  const toggleLanguage = useCallback(() => {
    setShowOriginal(prev => {
      console.log('🌍 Content Toggle:', prev ? 'Showing Translation' : 'Showing Original');
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

    // Handle { english, original } wrappers
    if (isPlainObject(data) && (data.english !== undefined || data.original !== undefined)) {
      const picked = showOriginal
        ? (data.original ?? data.english ?? '')
        : (data.english ?? data.original ?? '');

      if (typeof picked === 'string') return picked;
      if (Array.isArray(picked)) return picked.map(item => t(item));

      if (isPlainObject(picked)) {
        const direct = extractText(picked);
        if (direct) return direct;

        const out: any = {};
        for (const [k, v] of Object.entries(picked)) {
          out[k] = t(v);
        }
        return out;
      }

      return safeStr(picked);
    }

    // Plain objects: translate each field
    if (isPlainObject(data)) {
      const out: any = {};
      for (const [k, v] of Object.entries(data)) {
        out[k] = t(v);
      }
      return out;
    }

    return safeStr(data);
  }, [showOriginal]);

  // 🔥 Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    showOriginal,
    toggleLanguage,
    t,
    languageCode,
    setLanguageCode
  }), [showOriginal, toggleLanguage, t, languageCode]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};