export type MediaErrorPresentationKind =
  | 'none'
  | 'facebook_unavailable'
  | 'technical_failure';

export interface MediaErrorPresentation {
  kind: MediaErrorPresentationKind;
  titleKey: string;
  messageKey: string;
  canRetry: boolean;
  canOpenSource: boolean;
  sourceUrl: string;
}

interface MediaErrorOptions {
  isMissingThumbnail?: boolean;
}

const terminalStatuses = new Set(['error', 'failed', 'failure']);

const facebookUnavailableCodes = [
  'facebook_extraction_failed',
  'facebook_media_unavailable',
];

const normalizeText = (value: unknown): string =>
  String(value || '').trim().toLowerCase();

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
};

const getSourceUrl = (value: any): string =>
  firstString(
    value?.original_url,
    value?.originalUrl,
    value?.originalurl,
    value?.source_url,
    value?.sourceUrl,
    value?.sourceurl,
    value?.raw?.original_url,
    value?.raw?.originalUrl,
    value?.raw?.originalurl,
    value?.raw?.source_url,
    value?.raw?.sourceUrl,
    value?.raw?.sourceurl,
  );

const getErrorText = (value: any): string =>
  [
    value?.error_message,
    value?.errorMessage,
    value?.errormessage,
    value?.error_code,
    value?.errorCode,
    value?.errorcode,
    value?.error,
    value?.message,
    value?.raw?.error_message,
    value?.raw?.errorMessage,
    value?.raw?.errormessage,
    value?.raw?.error_code,
    value?.raw?.errorCode,
    value?.raw?.errorcode,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

const isFacebookUrl = (value: unknown): boolean => {
  const url = normalizeText(value);
  return (
    url.includes('facebook.com') ||
    url.includes('fb.com') ||
    url.includes('fb.watch')
  );
};

const isFacebookPayload = (value: any): boolean => {
  const platform = normalizeText(value?.platform ?? value?.raw?.platform);
  if (platform === 'facebook' || platform === 'fb') {
    return true;
  }

  return isFacebookUrl(getSourceUrl(value));
};

const technicalFailurePresentation = (
  sourceUrl: string,
): MediaErrorPresentation => ({
  kind: 'technical_failure',
  titleKey: 'videoCard:technicalFailureTitle',
  messageKey: 'videoCard:technicalFailureMessage',
  canRetry: true,
  canOpenSource: false,
  sourceUrl,
});

export const getMediaErrorPresentation = (
  value: any,
  options: MediaErrorOptions = {},
): MediaErrorPresentation => {
  const status = normalizeText(value?.status || value?.category);
  const sourceUrl = getSourceUrl(value);
  const isTerminal = terminalStatuses.has(status);

  if (!isTerminal && !options.isMissingThumbnail) {
    return {
      kind: 'none',
      titleKey: '',
      messageKey: '',
      canRetry: false,
      canOpenSource: false,
      sourceUrl,
    };
  }

  const errorText = getErrorText(value);
  const isFacebookUnavailable =
    isTerminal &&
    isFacebookPayload(value) &&
    facebookUnavailableCodes.some((code) => errorText.includes(code));

  if (isFacebookUnavailable) {
    return {
      kind: 'facebook_unavailable',
      titleKey: 'videoCard:facebookUnavailableTitle',
      messageKey: 'videoCard:facebookUnavailableMessage',
      canRetry: false,
      canOpenSource: Boolean(sourceUrl),
      sourceUrl,
    };
  }

  return technicalFailurePresentation(sourceUrl);
};
