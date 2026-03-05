import { API_BASE } from "../utils/api";
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
    
    // ✅ Added 'organizer' to the namespace list
    ns: [
      'common', 
      'gallery', 
      'settings', 
      'header', 
      'sidebar', 
      'organizer',
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
      order: ['localStorage', 'navigator'], 
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json?v=' + new Date().getTime()
    },

    interpolation: {
      escapeValue: false, 
    }
  });

export default i18n;