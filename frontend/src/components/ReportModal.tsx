import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, initialUrl = '' }) => {
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
        return ['Wrong poster', 'Wrong content', 'Language error', 'Recipe instructions missing', 'Ingredients missing'];
      case 'workout':
        return ['Wrong poster', 'Wrong content', 'Language error', 'Workout routine missing', 'Exercise steps unclear'];
      case 'beauty':
        return ['Wrong poster', 'Wrong content', 'Language error', 'Make-up routine missing', 'Product list incomplete'];
      case 'other':
        return ['Wrong poster', 'Wrong content', 'Language error'];
      default:
        return [];
    }
  };

  const handleNext = () => {
    if (reportStep === 1 && !reportData.contentType) {
      alert('Please select a content type');
      return;
    }
    if (reportStep === 2 && reportData.errorType.length === 0) {
      alert('Please select at least one error type');
      return;
    }
    if (reportStep === 3 && !reportData.details.trim()) {
      alert('Please provide some details');
      return;
    }
    setReportStep(reportStep + 1);
  };

  const handleSubmit = async () => {
    if (!reportData.url.trim()) {
      alert('Please provide a URL');
      return;
    }

    console.log('📤 Submitting report:', reportData);
    
    // TODO: Send to backend
    // await fetch(`${API_BASE}/api/report_issue`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(reportData)
    // });

    alert('Report submitted successfully! Thank you for your feedback.');
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

  const toggleErrorType = (error: string) => {
    if (reportData.errorType.includes(error)) {
      setReportData({
        ...reportData,
        errorType: reportData.errorType.filter(e => e !== error)
      });
    } else {
      setReportData({
        ...reportData,
        errorType: [...reportData.errorType, error]
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
            <h2 className="text-lg font-bold text-gray-900">Report Content Issue</h2>
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
              <h3 className="font-bold text-gray-900 mb-2">What type of content is this?</h3>
              <p className="text-sm text-gray-500 mb-4">Select the category that best describes this reel</p>
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
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Error Type */}
          {reportStep === 2 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">What's wrong with this content?</h3>
              <p className="text-sm text-gray-500 mb-4">Select all that apply</p>
              <div className="space-y-2">
                {getErrorOptions(reportData.contentType).map((error) => (
                  <button
                    key={error}
                    onClick={() => toggleErrorType(error)}
                    className={`w-full p-4 rounded-lg border-2 text-left font-medium transition ${
                      reportData.errorType.includes(error)
                        ? 'border-primary-600 bg-primary-50 text-primary-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{error}</span>
                      {reportData.errorType.includes(error) && (
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
              <h3 className="font-bold text-gray-900 mb-2">Describe the issue in more detail</h3>
              <p className="text-sm text-gray-500 mb-4">Help us understand what went wrong (optional but helpful)</p>
              <textarea
                value={reportData.details}
                onChange={(e) => {
                  if (e.target.value.length <= 300) {
                    setReportData({ ...reportData, details: e.target.value });
                  }
                }}
                placeholder="E.g., The recipe ingredients are missing, or the workout instructions are unclear..."
                className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-sm"
              />
              <div className="text-right text-xs text-gray-500 mt-1">
                {reportData.details.length}/300 characters
              </div>
            </div>
          )}

          {/* Step 4: URL */}
          {reportStep === 4 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-2">Source URL</h3>
              <p className="text-sm text-gray-500 mb-4">Provide the Reel URL or the Recolekt link for reference</p>
              <input
                type="url"
                value={reportData.url}
                onChange={(e) => setReportData({ ...reportData, url: e.target.value })}
                placeholder="https://www.instagram.com/reel/..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              
              {/* Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">Report Summary</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-700">Content Type:</span>{' '}
                    <span className="text-gray-900">{reportData.contentType}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Issues:</span>{' '}
                    <span className="text-gray-900">{reportData.errorType.join(', ')}</span>
                  </div>
                  {reportData.details && (
                    <div>
                      <span className="font-semibold text-gray-700">Details:</span>{' '}
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
            Cancel
          </button>
          {reportStep < 4 ? (
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-3 rounded-lg bg-primary-600 text-white hover:bg-primary-700 font-medium transition"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium transition"
            >
              Submit Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
