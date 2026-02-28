import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    
    // 🔥 List all namespaces used in your project to ensure they are loaded
    ns: [
      'common', 
      'gallery', 
      'settings', 
      'header', 
      'sidebar', 
      'videoCard', 
      'videoDetail', 
      'account',
      'auth',
      'modals',
      'home',
      'features',
      'billing'
    ],
    defaultNS: 'common',

    detection: {
      // 1. Check storage first for instant flicker-free loading
      // 2. ONLY check navigator (browser) if storage is empty
      order: ['localStorage', 'navigator'], 
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    backend: {
      // Points to frontend/public/locales/...
      // 💡 CACHE BUSTING: Forces the browser to always fetch the latest translation files
      loadPath: '/locales/{{lng}}/{{ns}}.json?v=' + new Date().getTime()
    },

    interpolation: {
      escapeValue: false, // React already escapes values to prevent XSS
    }
  });

export default i18n;