import React from "react";

const SUGGESTIONS = [
  "Replace an ingredient",
  "Make it lighter",
  "Scale the recipe",
  "Make it gluten-free",
];

type Props = {
  question: string;
  response?: string;
  onAsk: (q: string) => void;
  loading?: boolean;
};

const RecipeAskPanel: React.FC<Props> = ({ question, response, onAsk, loading }) => {
  const [input, setInput] = React.useState(question || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onAsk(input.trim());
  };

  const handleSuggestion = (label: string) => {
    setInput(label);
    onAsk(label);
  };

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => handleSuggestion(label)}
            className="rounded-full border border-white/35 bg-white/15 px-3.5 py-2 text-[12.5px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-12 flex-1 rounded-xl border border-white/30 bg-white px-4 text-[14.5px] text-gray-950 shadow-[0_2px_8px_rgba(15,23,42,0.12)] outline-none placeholder:text-gray-400"
          placeholder="e.g. swap almonds for hazelnuts…"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-12 rounded-xl bg-white px-6 text-[14.5px] font-black text-primary-600 shadow-[0_4px_14px_rgba(15,23,42,0.18)] transition hover:bg-gray-50 disabled:opacity-60"
        >
          Ask
        </button>
      </form>
      {loading && (
        <div className="text-sm font-medium text-white/70">Thinking…</div>
      )}
      {response && (
        <div className="flex gap-3 rounded-2xl border border-white/25 bg-white/16 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <p className="text-[13.5px] leading-relaxed text-white">{response}</p>
        </div>
      )}
    </div>
  );
};

export default RecipeAskPanel;
