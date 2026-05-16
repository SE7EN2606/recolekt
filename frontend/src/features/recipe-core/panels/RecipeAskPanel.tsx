import React from "react";

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
    onAsk(input);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 border rounded px-3 py-1"
          placeholder="Ask about this recipe..."
        />
        <button type="submit" disabled={loading} className="btn-primary">
          Ask
        </button>
      </form>
      {response && <div className="bg-gray-50 p-3 rounded">{response}</div>}
      {loading && <div className="text-gray-400">Loading...</div>}
    </div>
  );
};

export default RecipeAskPanel;
