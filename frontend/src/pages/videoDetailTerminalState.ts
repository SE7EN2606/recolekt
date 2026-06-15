export const FACEBOOK_ACCESS_ERROR_MESSAGE =
  'This Facebook reel could not be accessed. It may be deleted, private, expired, or blocked by Facebook.';

export const isFacebookAccessError = (value: any): boolean => {
  const message = String(
    value?.error_message ||
    value?.errorMessage ||
    value?.error ||
    ''
  ).toLowerCase();
  const status = String(value?.status || '').toLowerCase();

  if (status !== 'error' && status !== 'failed' && status !== 'failure') {
    return false;
  }

  return (
    message.includes('facebook_extraction_failed') ||
    message.includes('download') ||
    message.includes('cannot parse data') ||
    message.includes('login required') ||
    message.includes('social_login_required') ||
    message.includes('social_cookies_expired') ||
    message.includes('facebook_media_unavailable')
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
