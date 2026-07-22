import assert from 'node:assert/strict';
import {
  GENERIC_REEL_FAILURE_MESSAGE,
  MISSING_REEL_MESSAGE,
  getApiErrorPresentation,
  getSafeFailureMessage,
  getTerminalFailurePresentation,
} from '../src/pages/videoDetailTerminalState.ts';

const genericStatuses = [400, 403, 409, 422, 429, 500];

assert.equal(
  getTerminalFailurePresentation({
    status: 'failed',
    error_message: 'Traceback: backend implementation detail',
  })?.message,
  GENERIC_REEL_FAILURE_MESSAGE,
  'generic terminal failures should use sanitized presentation text',
);

assert.equal(
  getApiErrorPresentation({ status: 404 })?.message,
  MISSING_REEL_MESSAGE,
  '404 API errors should map to the missing reel presentation',
);

assert.equal(
  getApiErrorPresentation({ status: 410 })?.message,
  MISSING_REEL_MESSAGE,
  '410 API errors should map to the missing reel presentation',
);

assert.equal(
  getApiErrorPresentation({ status: 401 }),
  null,
  '401 API errors should be left to the existing auth/session behavior',
);

for (const status of genericStatuses) {
  assert.equal(
    getApiErrorPresentation({ status, message: 'Traceback: raw backend detail' })?.message,
    GENERIC_REEL_FAILURE_MESSAGE,
    `${status} API errors should use sanitized generic text`,
  );
}

assert.equal(
  getApiErrorPresentation(new DOMException('The operation was aborted.', 'AbortError')),
  null,
  'AbortError should not masquerade as a missing reel',
);

assert.equal(
  getSafeFailureMessage(new TypeError('Failed to fetch')),
  GENERIC_REEL_FAILURE_MESSAGE,
  'network failures should use sanitized generic text',
);

console.log('VideoDetail terminal-state tests passed');
