import { API_BASE } from './api';

export const APP_ENV =
  typeof window !== 'undefined' && window.location.hostname.includes('staging')
    ? 'staging'
    : API_BASE.includes('127.0.0.1') || API_BASE.includes('localhost')
      ? 'development'
      : 'production';

export const IS_STAGING = APP_ENV === 'staging';
export const IS_DEV = APP_ENV === 'development';