import { API_BASE } from "../utils/api";
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, initialUrl = '' }) => {
  const { t } = useTranslation(['modals', 'common']);
  const [reportStep, setReportStep] = useState(1);
  const [reportData, setReportData] = useState({
    contentType: '',
    errorType: [] as string[],
    details: '',
    url: initialUrl || window.location.href
  });

  const getErrorOptions = (contentType: string) => {
    switch (contentType) {
      case 'recipe':
        return ['errWrongPoster', 'errWrongContent', 'errLangError', 'errRecipeMissing', 'errIngredientsMissing'];
      case 'workout':
        return ['errWrongPoster', 'errWrongContent', 'errLangError', 'errWorkoutMissing', 'errExerciseUnclear'];
      case 'beauty':
        return ['errWrongPoster', 'errWrongContent', 'errLangError', 'errMakeupMissing', 'errProductsIncomplete'];
      case 'other':
        return ['errWrongPoster', 'errWrongContent', 'errLangError'];
      default:
        return [];
    }
  };

  const handleNext = () => {
    if (reportStep === 1 && !reportData.contentType) {
      alert(t('modals:alertSelectType', 'Please select a content type'));
      return;
    }
    if (reportStep === 2 && reportData.errorType.length === 0) {
      alert(t('modals:alertSelectError', 'Please select at least one error type'));
      return;
    }
    if (reportStep === 3 && !reportData.details.trim()) {
      alert(t('modals:alertProvideDetails', 'Please provide some details'));
      return;
    }
    setReportStep(reportStep + 1);
  };

  const handleSubmit = async () => {
    if (!reportData.url.trim()) {
      alert(t('modals:alertProvideUrl', 'Please provide a URL'));
      return;
    }

    console.log('📤 Submitting report:', reportData);
    
    // TODO: Send to backend
    // await fetch(`${API_BASE}/api/report_issue`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(reportData)
    // });

    alert(t('modals:alertSuccess', 'Report submitted successfully! Thank you for your feedback.'));
    handleClose();
  };

  const handleClose = () => {
    setReportStep(1);
    setReportData({
      contentType: '',
      errorType: [],
      details: '',
      url: initialUrl || window.location.href
    });
    onClose();
  };

  const toggleErrorType = (errorKey: string) => {
    if (reportData.errorType.includes(errorKey)) {
      setReportData({
        ...reportData,
        errorType: reportData.errorType.filter(e => e !== errorKey)
      });
    } else {
      setReportData({
        ...reportData,
        errorType: [...reportData.errorType, errorKey]
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{t('modals:reportTitle', 'Report Content Issue')}</h2>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">
              {reportStep}/4
            </span>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-600 transition-all duration-300"
              style={{ width: `${(reportStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="px-6 py-6">
          {/* Step 1: Content Type */}
          {reportStep === 1 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">{t('modals:reportStep1Title', 'What type of content is this?')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('modals:reportStep1Desc', 'Select the category that best describes this reel')}</p>
              <div className="space-y-2">
                {['recipe', 'workout', 'beauty', 'other'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportData({ ...reportData, contentType: type, errorType: [] })}
                    className={`w-full p-4 rounded-lg border-2 text-left font-medium transition ${
                      reportData.contentType === type
                        ? 'border-primary-600 bg-primary-50 text-primary-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t(`modals:type_${type}`, type.charAt(0).toUpperCase() + type.slice(1))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Error Type */}
          {reportStep === 2 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">{t('modals:reportStep2Title', "What's wrong with this content?")}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('modals:reportStep2Desc', 'Select all that apply')}</p>
              <div className="space-y-2">
                {getErrorOptions(reportData.contentType).map((errorKey) => (
                  <button
                    key={errorKey}
                    onClick={() => toggleErrorType(errorKey)}
                    className={`w-full p-4 rounded-lg border-2 text-left font-medium transition ${
                      reportData.errorType.includes(errorKey)
                        ? 'border-primary-600 bg-primary-50 text-primary-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{t(`modals:${errorKey}`)}</span>
                      {reportData.errorType.includes(errorKey) && (
                        <span className="text-primary-600">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {reportStep === 3 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">{t('modals:reportStep3Title', 'Describe the issue in more detail')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('modals:reportStep3Desc', 'Help us understand what went wrong (optional but helpful)')}</p>
              <textarea
                value={reportData.details}
                onChange={(e) => {
                  if (e.target.value.length <= 300) {
                    setReportData({ ...reportData, details: e.target.value });
                  }
                }}
                placeholder={t('modals:reportStep3Placeholder', 'E.g., The recipe ingredients are missing, or the workout instructions are unclear...')}
                className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-sm"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {t('modals:characters', '{{count}}/300 characters', { count: reportData.details.length })}
              </div>
            </div>
          )}

          {/* Step 4: URL */}
          {reportStep === 4 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">{t('modals:reportStep4Title', 'Source URL')}</h3>
              <p className="text-sm text-gray-500 mb-4">{t('modals:reportStep4Desc', 'Provide the Reel URL or the Recolekt link for reference')}</p>
              <input
                type="url"
                value={reportData.url}
                onChange={(e) => setReportData({ ...reportData, url: e.target.value })}
                placeholder="https://www.instagram.com/reel/..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              
              {/* Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">{t('modals:reportSummary', 'Report Summary')}</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-700">{t('modals:contentType', 'Content Type:')}</span>{' '}
                    <span className="text-gray-900">{t(`modals:type_${reportData.contentType}`, reportData.contentType)}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">{t('modals:issues', 'Issues:')}</span>{' '}
                    <span className="text-gray-900">
                      {reportData.errorType.map(err => t(`modals:${err}`)).join(', ')}
                    </span>
                  </div>
                  {reportData.details && (
                    <div>
                      <span className="font-semibold text-gray-700">{t('modals:details', 'Details:')}</span>{' '}
                      <span className="text-gray-900">{reportData.details}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition"
          >
            {t('common:cancel', 'Cancel')}
          </button>
          {reportStep < 4 ? (
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-3 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium transition"
            >
              {t('common:next', 'Next')}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium transition"
            >
              {t('modals:submitReport', 'Submit Report')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};