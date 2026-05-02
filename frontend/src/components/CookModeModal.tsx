import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChefHat, Clock, Pause, Play, X, HelpCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CookModeInstruction =
  | string
  | {
      instruction?: string | null;
      text?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean | null;
    };

export type CookModeIngredient =
  | string
  | {
      item?: string | null;
      name?: string | null;
      emoji?: string | null;
      quantity?: string | number | null;
      unit?: string | null;
      quantityRange?: { min: number; max: number; unit?: string } | null;
      needs_review?: boolean | null;
    };

type CookTimer = {
  stepIndex: number;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
};

interface CookModeModalProps {
  isOpen: boolean;
  recipeId: string;
  recipeName: string;
  instructions: CookModeInstruction[];
  ingredients?: CookModeIngredient[];
  initialStepIndex?: number;
  onClose: () => void;
  onProgressChange?: (stepIndex: number) => void;
  onComplete?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CULINARY GLOSSARY  (EN + FR)
// ─────────────────────────────────────────────────────────────────────────────

const GLOSSARY: Record<string, string> = {
  sear:         'Cook on very high heat to form a golden-brown crust quickly.',
  deglaze:      'Add liquid to a hot pan to lift the caramelised bits stuck to the bottom.',
  blanch:       'Briefly boil, then immediately cool in ice water to stop cooking.',
  braise:       'Slow-cook in a small amount of liquid with the lid on.',
  confit:       'Cook slowly while submerged in fat at low temperature.',
  reduce:       'Simmer uncovered until liquid evaporates and flavour concentrates.',
  simmer:       'Cook just below boiling — small, gentle bubbles only.',
  strain:       'Pass through a sieve or strainer to remove solids.',
  shred:        'Pull cooked meat apart into thin strips with forks or your hands.',
  caramelize:   'Cook until sugars brown and develop a deep, sweet flavour.',
  sauté:        'Cook quickly in a small amount of fat over high heat.',
  season:       'Add salt and pepper to balance and enhance the flavour.',
  fold:         'Gently incorporate without deflating air from the mixture.',
  emulsify:     'Combine fat and liquid into a smooth, stable mixture.',
  syrupy:       'Reduced until thick enough to coat the back of a spoon.',
  'dorées':     'Bien colorées à feu vif — une croûte légèrement croustillante.',
  mijoter:      'Cuire à feu doux avec de petits frémissements réguliers.',
  frémissement: 'Légère ébullition — seulement quelques petites bulles.',
  effilocher:   'Déchirer la viande cuite en fines lamelles à la main ou à la fourchette.',
  filtrer:      'Passer au tamis pour séparer le liquide des solides.',
  réduire:      'Laisser mijoter sans couvercle pour évaporer et concentrer les saveurs.',
  griller:      'Cuire à feu vif pour former une belle croûte dorée.',
  assaisonner:  'Ajouter sel et poivre pour équilibrer et rehausser les saveurs.',
  sirupeux:     'Réduit jusqu\'à napper la cuillère — texture épaisse et brillante.',
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getText = (s: CookModeInstruction): string =>
  (typeof s === 'string' ? s : ((s?.instruction || s?.text || '') as string)).trim();

const ingName = (i: CookModeIngredient): string =>
  (typeof i === 'string' ? i : ((i as any)?.item || (i as any)?.name || '') as string).trim();

const ingEmoji = (i: CookModeIngredient): string =>
  typeof i === 'string' ? '' : String((i as any)?.emoji || '');

// Fix: reads quantityRange first, then falls back to quantity
const ingQty = (i: CookModeIngredient): string => {
  if (typeof i === 'string') return '';
  const b = i as any;
  if (b.quantityRange) {
    const u = b.quantityRange.unit || b.unit || '';
    return u
      ? `${b.quantityRange.min}–${b.quantityRange.max} ${u}`
      : `${b.quantityRange.min}–${b.quantityRange.max}`;
  }
  const q = b.quantity != null ? String(b.quantity).trim() : '';
  const u = b.unit ? String(b.unit).trim() : '';
  return q ? (u ? `${q} ${u}` : q) : '';
};

// Stop words to exclude from matching (these appear in every French sentence)
const STOPWORDS = new Set([
  'de','du','la','le','les','des','un','une','au','aux','et','ou','en','dans',
  'sur','par','avec','pour','que','qui','se','on','il','elle','nous','vous','ils',
  'elles','of','the','and','or','in','at','to','a','an','is','it','its',
]);

// Fix: minimum 4 chars AND not a stopword — eliminates "de", "du", etc.
const ingTokens = (i: CookModeIngredient): string[] => {
  const name = ingName(i).toLowerCase();
  return name
    .split(/[\s,''\-/]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
};

// Match only on ingredient's own name tokens — no semantic aliases that caused false positives
const matchIngs = (step: string, ings: CookModeIngredient[]): CookModeIngredient[] => {
  const lower = step.toLowerCase();
  return ings.filter((ing) => {
    const tokens = ingTokens(ing);
    return tokens.length > 0 && tokens.some((t) => lower.includes(t));
  });
};

const fmtTime = (s: number): string => {
  const safe = Math.max(0, Math.floor(s));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const sec = safe % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

const detectTimer = (text: string): number | null => {
  const m = text.match(/\b(\d+(?:[.,]\d+)?)\s*(min(?:ute)?s?|hr|hrs|hour|hours|heure[s]?)\b/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2][0].toLowerCase() === 'h' ? Math.round(n * 3600) : Math.round(n * 60);
};

const previewWords = (text: string, max = 14): string => {
  const w = text.trim().split(/\s+/);
  return w.length <= max ? text : `${w.slice(0, max).join(' ')}…`;
};

// ─────────────────────────────────────────────────────────────────────────────
// RICH INSTRUCTION with bold numbers + tappable glossary terms
// ─────────────────────────────────────────────────────────────────────────────

const RichInstruction: React.FC<{ text: string }> = ({ text }) => {
  const [tip, setTip] = React.useState<{ term: string; def: string } | null>(null);

  const glossaryTerms = React.useMemo(
    () => Object.keys(GLOSSARY).sort((a, b) => b.length - a.length),
    [],
  );

  type Seg = { type: 'text' | 'number' | 'term'; content: string; term?: string };

  const segments: Seg[] = React.useMemo(() => {
    const result: Seg[] = [];
    const termPat = glossaryTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    // Match: numbers+units OR glossary terms (word boundary)
    const rx = new RegExp(
      `(\\b\\d+(?:[.,]\\d+)?\\s*(?:g|kg|ml|l|min(?:utes?)?|h(?:eure[s]?|ours?)?|°c|°f)\\b|\\b(?:${termPat})\\b)`,
      'gi',
    );
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) result.push({ type: 'text', content: text.slice(last, m.index) });
      const raw = m[0];
      const lo = raw.toLowerCase();
      if (/^\d/.test(raw)) {
        result.push({ type: 'number', content: raw });
      } else {
        const key = glossaryTerms.find((t) => lo === t || lo.startsWith(t));
        result.push(key ? { type: 'term', content: raw, term: key } : { type: 'text', content: raw });
      }
      last = m.index + raw.length;
    }
    if (last < text.length) result.push({ type: 'text', content: text.slice(last) });
    return result;
  }, [text, glossaryTerms]);

  return (
    <div className="w-full">
      {/* Instruction text — capped at 28px max */}
      <p
        className="text-center font-black leading-[1.28] tracking-[-0.02em] text-gray-950"
        style={{ fontSize: 'clamp(20px, 2vw, 28px)' }}
      >
        {segments.map((seg, i) => {
          if (seg.type === 'number') {
            return <span key={i} className="text-primary-600">{seg.content}</span>;
          }
          if (seg.type === 'term' && seg.term) {
            return (
              <span
                key={i}
                className="underline decoration-dotted decoration-primary-400 cursor-pointer"
                style={{ textDecorationThickness: 2, textUnderlineOffset: 4 }}
                onClick={() => setTip(tip?.term === seg.term ? null : { term: seg.term!, def: GLOSSARY[seg.term!] })}
              >
                {seg.content}
              </span>
            );
          }
          return <span key={i}>{seg.content}</span>;
        })}
      </p>

      {/* Glossary tooltip */}
      {tip && (
        <div
          className="mx-auto mt-4 max-w-sm rounded-2xl px-4 py-3 text-left"
          style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}
        >
          <div className="flex items-start gap-2.5">
            <HelpCircle size={14} className="text-primary-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary-600 mb-1">{tip.term}</p>
              <p className="text-[12px] text-gray-600 leading-relaxed">{tip.def}</p>
            </div>
            <button onClick={() => setTip(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

const Progress: React.FC<{ total: number; current: number }> = ({ total, current }) =>
  total > 12 ? (
    <div className="flex items-center gap-2">
      <div className="h-1 w-24 rounded-full overflow-hidden bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(((current + 1) / total) * 100)}%`, background: 'linear-gradient(90deg,#7c3aed,#e11d48)' }}
        />
      </div>
      <span className="text-[11px] font-black text-gray-400 tabular-nums">{current + 1}/{total}</span>
    </div>
  ) : (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="rounded-full transition-all duration-300" style={{
          height: 6,
          width: i === current ? 20 : 6,
          background: i < current ? '#d1d5db' : i === current ? 'linear-gradient(90deg,#7c3aed,#e11d48)' : '#e5e7eb',
        }} />
      ))}
    </div>
  );

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const CookModeModal: React.FC<CookModeModalProps> = ({
  isOpen,
  recipeId,
  recipeName,
  instructions,
  ingredients = [],
  initialStepIndex = 0,
  onClose,
  onProgressChange,
  onComplete,
}) => {
  const steps = React.useMemo(() => instructions.map(getText).filter(Boolean), [instructions]);

  const [idx,    setIdx]    = React.useState(initialStepIndex);
  const [done,   setDone]   = React.useState(false);
  const [flash,  setFlash]  = React.useState(false);
  const [note,   setNote]   = React.useState('');
  const [noteSaved, setNoteSaved] = React.useState(false);
  const [timers, setTimers] = React.useState<Record<number, CookTimer>>({});
  const wakeLock = React.useRef<any>(null);
  const started  = React.useRef(Date.now());
  const opened   = React.useRef(false);

  const cur     = steps[idx] || '';
  const next    = idx < steps.length - 1 ? steps[idx + 1] : '';
  const timerS  = detectTimer(cur);
  const curT    = timers[idx];
  const isLast  = idx >= steps.length - 1;

  const stepIngs = React.useMemo(() => matchIngs(cur, ingredients), [cur, ingredients]);

  const activeTimers = Object.values(timers)
    .filter((t) => t.running || t.remainingSeconds < t.totalSeconds)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const noteKey = React.useMemo(
    () => `recolekt:cook-note:${recipeId}`,
    [recipeId],
  );

  React.useEffect(() => {
    if (!isOpen) { opened.current = false; return; }
    if (opened.current) return;
    opened.current = true;
    setIdx(Math.min(Math.max(initialStepIndex, 0), steps.length - 1));
    setDone(false); setFlash(false); setNoteSaved(false);
    try {
      setNote(window.localStorage.getItem(noteKey) || '');
    } catch {
      setNote('');
    }
    started.current = Date.now();
    (async () => { try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch {} })();
    return () => { try { wakeLock.current?.release?.(); } catch {} wakeLock.current = null; };
  }, [isOpen, initialStepIndex, steps.length, noteKey]);

  React.useEffect(() => {
    if (!Object.values(timers).some((t) => t.running && t.remainingSeconds > 0)) return;
    const iv = setInterval(() => {
      setTimers((p) => {
        const n = { ...p };
        Object.entries(n).forEach(([k, t]) => {
          if (!t.running || t.remainingSeconds <= 0) return;
          const rem = Math.max(0, t.remainingSeconds - 1);
          n[+k] = { ...t, remainingSeconds: rem, running: rem > 0 };
        });
        return n;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timers]);

  React.useEffect(() => {
    if (isOpen && !done) onProgressChange?.(idx);
  }, [isOpen, done, idx, onProgressChange]);

  React.useEffect(() => {
    if (!isOpen || !done) return;

    try {
      if (note.trim()) {
        window.localStorage.setItem(noteKey, note.trim());
        setNoteSaved(true);
      } else {
        window.localStorage.removeItem(noteKey);
        setNoteSaved(false);
      }
    } catch {
      setNoteSaved(false);
    }
  }, [isOpen, done, note, noteKey]);

  if (!isOpen) return null;
  const root = document?.body;
  if (!root) return null;

  const close = () => {
    try { wakeLock.current?.release?.(); } catch {}
    wakeLock.current = null;
    onClose();
  };

  const handleDone = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 380);
    if (isLast) { setDone(true); onComplete?.(); return; }
    setIdx((p) => p + 1);
  };

  const toggleTimer = () => {
    if (!timerS) return;
    setTimers((p) => {
      const ex = p[idx];
      const t: CookTimer = ex || { stepIndex: idx, totalSeconds: timerS, remainingSeconds: timerS, running: false };
      return { ...p, [idx]: { ...t, running: !t.running } };
    });
  };

  const elapsed = Math.max(1, Math.round((Date.now() - started.current) / 60000));

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-gray-950/50 backdrop-blur-sm">
      <div className="fixed inset-0 flex flex-col bg-white md:inset-5 md:rounded-[28px] md:shadow-2xl overflow-hidden">

        {/* ── HEADER ── */}
        <header className="flex-shrink-0 flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button
            onClick={close}
            className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <Progress total={steps.length} current={idx} />
            {/* Fix: title visible at 15px bold, not truncated too aggressively */}
            <p className="font-bold text-gray-800 text-center leading-tight"
              style={{ fontSize: 15 }}>
              {recipeName}
            </p>
          </div>

          <div className="w-9 flex-shrink-0" />
        </header>

        {/* ── RUNNING TIMERS ── */}
        {activeTimers.length > 0 && (
          <div className="flex-shrink-0 flex gap-2 px-4 py-2 overflow-x-auto bg-amber-50 border-b border-amber-100">
            {activeTimers.map((t) => {
              const urg = t.remainingSeconds <= 10;
              const wrn = t.remainingSeconds <= 60 && !urg;
              return (
                <button key={t.stepIndex} onClick={() => setIdx(t.stepIndex)}
                  className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black border"
                  style={{
                    background: urg ? '#fee2e2' : wrn ? '#fef3c7' : 'white',
                    borderColor: urg ? '#fca5a5' : wrn ? '#fcd34d' : '#fde68a',
                    color: urg ? '#dc2626' : wrn ? '#d97706' : '#b45309',
                  }}>
                  <Clock size={11} /> Step {t.stepIndex + 1} · {fmtTime(t.remainingSeconds)}
                </button>
              );
            })}
          </div>
        )}

        {/* ── MAIN ── */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {done ? (

            /* COMPLETION */
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-5 max-w-sm mx-auto w-full">
              <div className="h-20 w-20 flex items-center justify-center rounded-full bg-green-50">
                <Check size={34} strokeWidth={2.5} className="text-green-500" />
              </div>
              <div>
                <h3 className="text-3xl font-black text-gray-950 tracking-tight">All done!</h3>
                <p className="mt-1 text-sm text-gray-400 font-medium">{recipeName} · ~{elapsed} min</p>
              </div>
              <div className="w-full text-left mt-2">
                <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Note for next time</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="What would you change next time?" rows={3}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm resize-none outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-50" />
                {noteSaved && (
                  <p className="mt-2 text-[11px] font-bold text-green-600">
                    Saved locally
                  </p>
                )}
              </div>
              <button onClick={close}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white transition-all active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#e11d48)' }}>
                <ChefHat size={17} /> Done
              </button>
            </div>

          ) : (

            /* THREE-ZONE LAYOUT */
            <div className="flex-1 flex flex-col justify-between px-6 py-5 max-w-2xl mx-auto w-full">

              {/* ── TOP: step badge + ingredients ── */}
              <div className="flex flex-col items-center gap-3.5">

                <div className="inline-flex items-center rounded-full px-4 py-1.5"
                  style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <span className="text-[11px] font-black tracking-[0.1em] uppercase text-primary-600">
                    Step {idx + 1} of {steps.length}
                  </span>
                </div>

                {/* Ingredients — only shows when there are actual matches */}
                {stepIngs.length > 0 && (
                  <div className="w-full flex flex-col items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      For this step you'll need
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {stepIngs.map((ing, i) => {
                        const em  = ingEmoji(ing);
                        const nm  = ingName(ing);
                        const qt  = ingQty(ing);
                        const rev = typeof ing !== 'string' && (ing as any)?.needs_review;
                        return (
                          <div key={i}
                            className="flex items-center gap-2 rounded-2xl px-3.5 py-2"
                            style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                            {em && <span className="text-[17px] leading-none">{em}</span>}
                            <span className="text-[13px] font-bold text-gray-800">{nm}</span>
                            {qt
                              ? <span className="text-[12px] font-black text-primary-600">{qt}</span>
                              : rev && <span className="text-[11px] text-gray-400 italic">to taste</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="w-full h-px bg-gray-100" />
              </div>

              {/* ── MIDDLE: instruction + timer ── */}
              <div className="flex flex-col items-center gap-4">
                {flash ? (
                  <p className="text-center font-black" style={{
                    fontSize: 'clamp(20px, 2vw, 28px)',
                    background: 'linear-gradient(90deg,#7c3aed,#e11d48)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>✓ Done!</p>
                ) : (
                  <RichInstruction text={cur} />
                )}

                {timerS && (
                  <button onClick={toggleTimer}
                    className="flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-black transition-all active:scale-95"
                    style={curT?.running
                      ? { background: '#fef3c7', border: '1px solid #fcd34d', color: '#d97706' }
                      : { background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed' }}>
                    {curT?.running ? <Pause size={14} /> : <Play size={14} />}
                    {curT
                      ? `${curT.running ? 'Pause' : 'Resume'} · ${fmtTime(curT.remainingSeconds)}`
                      : `Start timer · ${fmtTime(timerS)}`}
                  </button>
                )}
              </div>

              {/* ── BOTTOM: next step — clear label + legible text ── */}
              <div>
                <div className="w-full h-px bg-gray-100 mb-4" />
                {next ? (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3.5">
                    {/* Fix: "Next step" clearly labeled, step number shown */}
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                      Next — step {idx + 2}
                    </p>
                    {/* Fix: text at 14px semibold gray-600, not 13px */}
                    <p className="text-[14px] font-semibold text-gray-600 leading-snug">
                      {previewWords(next, 16)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl text-center px-4 py-3.5"
                    style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                    <p className="text-[12px] font-black text-primary-600 uppercase tracking-widest">
                      🎉 This is the last step
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}
        </main>

        {/* ── FOOTER ── */}
        {!done && (
          <footer className="flex-shrink-0 px-5 py-4 border-t border-gray-100 bg-white">
            <div className="flex items-center gap-3 max-w-2xl mx-auto">
              <button
                onClick={() => setIdx((p) => Math.max(p - 1, 0))}
                disabled={idx === 0}
                className="flex-shrink-0 h-14 w-14 flex items-center justify-center rounded-2xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <button
                onClick={handleDone}
                className="flex-1 h-14 flex items-center justify-center gap-2.5 rounded-2xl text-[15px] font-black text-white transition-all active:scale-[0.99]"
                style={{
                  background: 'linear-gradient(135deg,#7c3aed 0%,#e11d48 100%)',
                  boxShadow: '0 8px 24px rgba(124,58,237,0.3)',
                }}
              >
                {isLast ? <><ChefHat size={18} /> Finish recipe</> : <>Next step <Check size={18} /></>}
              </button>
            </div>
          </footer>
        )}

      </div>
    </div>,
    root,
  );
};

export default CookModeModal;