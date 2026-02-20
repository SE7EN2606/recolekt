import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: 'en', // default language
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    ns: ['common', 'gallery'],
    defaultNS: 'common',
    
    detection: {
      order: ['navigator', 'localStorage'],
      caches: ['localStorage']
    },
    
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    },
    
    interpolation: { escapeValue: false }
  });

export default i18n;