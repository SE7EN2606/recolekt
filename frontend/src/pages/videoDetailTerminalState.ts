export const FACEBOOK_ACCESS_ERROR_MESSAGE =
  'This Facebook reel could not be accessed. It may be deleted, private, expired, or blocked by Facebook.';

export const MISSING_REEL_MESSAGE =
  'This saved reel no longer exists. It may have been deleted or replaced during refresh. Go back to Gallery.';

export const GENERIC_REEL_FAILURE_MESSAGE =
  'We could not finish loading this saved reel. Please try again, go back to Gallery, or open the original link if it is available.';

const terminalStatuses = new Set(['error', 'failed', 'failure']);

const explicitFacebookErrorCodes = [
  'facebook_extraction_failed',
  'facebook_media_unavailable',
];

const genericAccessIndicators = [
  'download',
  'cannot parse data',
  'login required',
  'social_login_required',
  'social_cookies_expired',
];

const normalizeText = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

export const isTerminalProcessingStatus = (value: unknown): boolean =>
  terminalStatuses.has(normalizeText(value));

const getErrorText = (value: any): string =>
  [
    value?.error_message,
    value?.errorMessage,
    value?.error,
    value?.message,
    value?.error_code,
    value?.errorCode,
    value?.code,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

const isFacebookUrl = (value: unknown): boolean => {
  const text = normalizeText(value);
  return (
    text.includes('facebook.com') ||
    text.includes('fb.com') ||
    text.includes('fb.watch')
  );
};

const isFacebookPayload = (value: any): boolean => {
  const platform = normalizeText(value?.platform);
  if (platform === 'facebook' || platform === 'fb') {
    return true;
  }

  return [
    value?.source_url,
    value?.sourceUrl,
    value?.original_url,
    value?.originalUrl,
  ].some(isFacebookUrl);
};

export const isFacebookAccessError = (value: any): boolean => {
  const message = getErrorText(value);
  const status = normalizeText(value?.status);

  if (!isTerminalProcessingStatus(status)) {
    return false;
  }

  if (explicitFacebookErrorCodes.some((code) => message.includes(code))) {
    return true;
  }

  if (!isFacebookPayload(value)) {
    return false;
  }

  return genericAccessIndicators.some((indicator) =>
    message.includes(indicator),
  );
};

export type VideoDetailFailurePresentation = {
  kind: 'missing' | 'facebook' | 'generic';
  message: string;
};

const getErrorStatus = (error: any): number | null => {
  const status = Number(error?.status);
  return Number.isFinite(status) ? status : null;
};

export const getApiErrorPresentation = (
  error: unknown,
): VideoDetailFailurePresentation | null => {
  const status = getErrorStatus(error);

  if (status === 404 || status === 410) {
    return { kind: 'missing', message: MISSING_REEL_MESSAGE };
  }

  if (status === 401) {
    return null;
  }

  if (status !== null && status >= 100 && status <= 599) {
    return { kind: 'generic', message: GENERIC_REEL_FAILURE_MESSAGE };
  }

  if ((error as any)?.name === 'AbortError') {
    return null;
  }

  if (error instanceof TypeError) {
    return { kind: 'generic', message: GENERIC_REEL_FAILURE_MESSAGE };
  }

  return null;
};

export const getTerminalFailurePresentation = (
  value: any,
): VideoDetailFailurePresentation | null => {
  if (!isTerminalProcessingStatus(value?.status)) return null;

  if (isFacebookAccessError(value)) {
    return { kind: 'facebook', message: FACEBOOK_ACCESS_ERROR_MESSAGE };
  }

  return { kind: 'generic', message: GENERIC_REEL_FAILURE_MESSAGE };
};

export const getSafeFailureMessage = (
  error: unknown,
  fallback = GENERIC_REEL_FAILURE_MESSAGE,
): string => {
  const presentation = getApiErrorPresentation(error);
  if (presentation) return presentation.message;

  if ((error as any)?.name === 'AbortError') return '';

  if (error instanceof Error) {
    if (error.message === 'Refresh is taking longer than expected. Please try again.') {
      return error.message;
    }
  }

  return fallback;
};

export const buildTerminalProcessingVideo = ({
  detail,
  merged,
  stable,
  fallbackId,
}: {
  detail: any;
  merged: any;
  stable?: any;
  fallbackId: string;
}) => {
  const status = String(detail?.status || merged?.status || 'error').toLowerCase();
  const errorMessage =
    detail?.error_message ||
    detail?.errorMessage ||
    merged?.error_message ||
    merged?.errorMessage ||
    detail?.error ||
    merged?.error ||
    'Refresh failed.';
  const base = {
    ...(stable || {}),
    ...(merged || {}),
  };
  const resolvedId =
    merged?.id ||
    merged?.process_id ||
    detail?.id ||
    detail?.process_id ||
    base.id ||
    base.process_id ||
    fallbackId;

  return {
    ...base,
    status,
    error_message: errorMessage,
    errorMessage,
    id: resolvedId,
    process_id:
      merged?.process_id ||
      merged?.id ||
      detail?.process_id ||
      detail?.id ||
      base.process_id ||
      base.id ||
      fallbackId,
  };
};
