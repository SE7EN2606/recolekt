import { API_BASE } from "../utils/api";
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

const extractText = (v: any): string => {
  if (typeof v === 'string') return v;
  if (!v) return '';
  if (isPlainObject(v) && (v.english !== undefined || v.original !== undefined)) return '';
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

  // Default content display is always English. The globe toggles original language manually.
  const [showOriginal, setShowOriginal] = useState<boolean>(false);

  const [languageCode, setLanguageCode] = useState('EN');

  useEffect(() => {
    console.log('🌍 App UI language changed to:', i18n.language);
  }, [i18n.language]);

  const toggleLanguage = useCallback(() => {
    setShowOriginal(prev => {
      const next = !prev;
      console.log('🔁 Content language toggled:', next ? 'Original' : 'English');
      return next;
    });
  }, []);

  const t = useCallback((data: any): any => {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(item => t(item));

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
        for (const [k, v] of Object.entries(picked)) out[k] = t(v);
        return out;
      }
      return safeStr(picked);
    }

    if (isPlainObject(data)) {
      const out: any = {};
      for (const [k, v] of Object.entries(data)) out[k] = t(v);
      return out;
    }

    return safeStr(data);
  }, [showOriginal]);

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