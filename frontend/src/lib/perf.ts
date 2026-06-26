export type PerfTimelineRow = {
  step: string;
  msFromMount: number;
  durationMs?: number;
};

export type PerfApiCall = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  startedAtRelativeMs: number | null;
  failed: boolean;
};

type PerfSession = {
  name: string;
  startedAtMs: number;
  steps: PerfTimelineRow[];
  stepNames: Set<string>;
  apiCalls: PerfApiCall[];
};

declare global {
  interface Window {
    __recolektPerfSession?: PerfSession;
  }
}

function getSession(): PerfSession | null {
  if (typeof window === 'undefined') return null;
  return window.__recolektPerfSession || null;
}

function setSession(session: PerfSession | null) {
  if (typeof window === 'undefined') return;
  if (session) {
    window.__recolektPerfSession = session;
    return;
  }
  delete window.__recolektPerfSession;
}

function safeRound(value: number): number {
  return Math.round(value * 10) / 10;
}

function perfMarkName(sessionName: string, step: string): string {
  const safeStep = step.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `recolekt:${sessionName}:${safeStep}`;
}

export function isPerfModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
}

export function startPerfSession(name: string) {
  if (!isPerfModeEnabled()) {
    setSession(null);
    return;
  }

  setSession({
    name,
    startedAtMs: performance.now(),
    steps: [],
    stepNames: new Set<string>(),
    apiCalls: [],
  });
}

export function markPerfStep(step: string, options: { durationMs?: number } = {}) {
  const session = getSession();
  if (!session || session.stepNames.has(step)) return;

  const row: PerfTimelineRow = {
    step,
    msFromMount: safeRound(performance.now() - session.startedAtMs),
    ...(options.durationMs !== undefined ? { durationMs: safeRound(options.durationMs) } : {}),
  };

  session.steps.push(row);
  session.stepNames.add(step);
  setSession(session);

  try {
    performance.mark(perfMarkName(session.name, step));
  } catch {
    // Ignore unsupported mark failures.
  }
}

export function measurePerfDuration(startMark: string, endMark: string, measureName: string): number | null {
  try {
    performance.measure(measureName, startMark, endMark);
    const entries = performance.getEntriesByName(measureName, 'measure');
    const lastEntry = entries[entries.length - 1];
    return lastEntry ? safeRound(lastEntry.duration) : null;
  } catch {
    return null;
  }
}

export function getPerfTimelineRows(): PerfTimelineRow[] {
  const session = getSession();
  return session ? [...session.steps].sort((a, b) => a.msFromMount - b.msFromMount) : [];
}

export function getPerfStepTime(step: string): number | null {
  const session = getSession();
  if (!session) return null;
  const row = session.steps.find((entry) => entry.step === step);
  return row ? row.msFromMount : null;
}

export function getSlowestPerfApiCall(): PerfApiCall | null {
  const session = getSession();
  if (!session || session.apiCalls.length === 0) return null;

  return session.apiCalls.reduce((slowest, current) => (
    current.durationMs > slowest.durationMs ? current : slowest
  ));
}

function sanitizePerfUrl(pathOrUrl: string): string {
  const raw = String(pathOrUrl || '');
  if (!raw) return raw;

  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://')
      ? new URL(raw)
      : new URL(raw, window.location.origin);

    const redacted = new Set([
      'token',
      'auth',
      'authorization',
      'signature',
      'sig',
      'x-goog-signature',
      'x-goog-credential',
      'x-goog-security-token',
      'key',
      'api_key',
      'access_token',
      'id_token',
    ]);

    const safeParams = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (redacted.has(key.toLowerCase())) return;
      safeParams.append(key, value);
    });

    const query = safeParams.toString();
    return `${url.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return raw.replace(/([?&](?:token|auth|authorization|signature|sig|key|api_key|access_token|id_token)=[^&]+)/gi, '');
  }
}

export function recordPerfApiCall(args: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  failed: boolean;
  startedPerfMs: number;
}) {
  if (!isPerfModeEnabled()) return;

  const cleanPath = sanitizePerfUrl(args.path);
  const session = getSession();
  const startedAtRelativeMs = session
    ? safeRound(args.startedPerfMs - session.startedAtMs)
    : null;

  const row: PerfApiCall = {
    method: args.method,
    path: cleanPath,
    status: args.status,
    durationMs: safeRound(args.durationMs),
    startedAtRelativeMs,
    failed: args.failed,
  };

  if (session) {
    session.apiCalls.push(row);
    setSession(session);
  }

  console.log(
    `[perf] api ${row.method} ${row.path} ${row.durationMs}ms status=${row.status}${row.failed ? ' failed=true' : ''}`
  );
  console.table([row]);
}
