import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Globe, Moon, Sun, ChevronRight, Check } from 'lucide-react';
import { API_BASE } from '../utils/api';
import { useTranslation } from 'react-i18next';

const STEPS = ['language', 'measurements', 'done'] as const;
type Step = typeof STEPS[number];

export const OnboardingFlow: React.FC = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [step, setStep] = useState<Step>('language');
  const [language, setLanguage] = useState('en');
  const [measurementSystem, setMeasurementSystem] = useState('metric');
  const [darkMode, setDarkMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentIndex = STEPS.indexOf(step);
  const progress = (currentIndex / (STEPS.length - 1)) * 100;

  const saveAndFinish = async () => {
    setSaving(true);
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    try {
      await fetch(`${API_BASE}/api/user/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language, measurementSystem, darkMode }),
      });
      i18n.changeLanguage(language);
      localStorage.setItem('onboarding_complete', 'true');
    } catch (e) {
      console.error('Failed to save preferences', e);
    }
    setSaving(false);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="h-1.5 bg-gray-100 w-full">
          <div className="h-full bg-primary-600 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="p-8">
          <div className="flex items-center gap-2 mb-8">
            {STEPS.filter(s => s !== 'done').map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${STEPS.indexOf(step) > i ? 'bg-primary-600 text-white' : step === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {STEPS.indexOf(step) > i ? <Check size={12} /> : i + 1}
                </div>
                {i < STEPS.filter(s => s !== 'done').length - 1 && (
                  <div className={`h-0.5 w-8 transition-colors ${STEPS.indexOf(step) > i ? 'bg-primary-600' : 'bg-gray-100'}`} />
                )}
              </div>
            ))}
            <span className="ml-auto text-[10px] font-black text-gray-400 uppercase tracking-widest">{currentIndex + 1} / {STEPS.length}</span>
          </div>

          {step === 'language' && (
            <div>
              <div className="mb-2 p-3 bg-blue-50 rounded-2xl w-fit"><Globe size={24} className="text-blue-600" /></div>
              <h2 className="text-2xl font-black text-gray-900 mt-4 mb-1">Choose your language</h2>
              <p className="text-gray-400 text-sm mb-8">You can change this anytime in Settings.</p>
              <div className="space-y-3">
                {[{ value: 'en', label: 'English', flag: '🇬🇧' }, { value: 'fr', label: 'Français', flag: '🇫🇷' }].map(({ value, label, flag }) => (
                  <button key={value} onClick={() => setLanguage(value)} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 font-bold text-sm transition-all ${language === value ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-gray-100 text-gray-700 hover:border-gray-200'}`}>
                    <span className="flex items-center gap-3"><span className="text-xl">{flag}</span>{label}</span>
                    {language === value && <Check size={16} className="text-primary-600" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'measurements' && (
            <div>
              <div className="mb-2 p-3 bg-emerald-50 rounded-2xl w-fit"><Scale size={24} className="text-emerald-600" /></div>
              <h2 className="text-2xl font-black text-gray-900 mt-4 mb-1">Set your measurements</h2>
              <p className="text-gray-400 text-sm mb-8">Choose the units you know best — you can change them anytime in Settings.</p>
              <div className="space-y-3 mb-6">
                {[{ value: 'metric', label: 'Metric', desc: 'grams, ml, °C' }, { value: 'us', label: 'US Customary', desc: 'cups, oz, °F' }, { value: 'imperial', label: 'Imperial', desc: 'lbs, pints, °F' }].map(({ value, label, desc }) => (
                  <button key={value} onClick={() => setMeasurementSystem(value)} className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${measurementSystem === value ? 'border-emerald-500 bg-emerald-50' : 'border-gray-100 hover:border-gray-200'}`}>
                    <div className="text-left">
                      <div className={`font-bold text-sm ${measurementSystem === value ? 'text-emerald-700' : 'text-gray-900'}`}>{label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                    </div>
                    {measurementSystem === value && <Check size={16} className="text-emerald-600" />}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  {darkMode ? <Moon size={18} className="text-gray-700" /> : <Sun size={18} className="text-gray-500" />}
                  <span className="font-bold text-sm text-gray-900">Dark Mode</span>
                </div>
                <button onClick={() => setDarkMode(!darkMode)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-6"><Check size={32} className="text-white" /></div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">You're all set!</h2>
              <p className="text-gray-400 text-sm">Your preferences have been saved. Start saving reels and recipes.</p>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {currentIndex > 0 && step !== 'done' && (
              <button onClick={() => setStep(STEPS[currentIndex - 1])} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">Back</button>
            )}
            {step !== 'done' ? (
              <button onClick={() => setStep(STEPS[currentIndex + 1])} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors">
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={saveAndFinish} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 text-white rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Go to Recolekt →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
