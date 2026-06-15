export const FACEBOOK_ACCESS_ERROR_MESSAGE =
  'This Facebook reel could not be accessed. It may be deleted, private, expired, or blocked by Facebook.';

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

  if (!terminalStatuses.has(status)) {
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
