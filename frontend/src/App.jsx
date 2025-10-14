import { useState } from "react";

export default function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("https://recolekt.onrender.com/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new Error(JSON.stringify(data, null, 2));
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100 p-8">
      <h1 className="text-2xl font-bold mb-4">Instagram Fetch Debug</h1>
      <input
        type="text"
        placeholder="Paste Instagram Reel URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="w-full max-w-xl p-2 text-black rounded mb-3"
      />
      <button
        onClick={handleFetch}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Fetching..." : "Fetch Instagram Data"}
      </button>

      {error && (
        <div className="mt-6 w-full max-w-2xl bg-red-900/40 border border-red-700 p-4 rounded">
          <h2 className="font-semibold text-red-400 mb-2">Error</h2>
          <pre className="text-sm whitespace-pre-wrap break-words">
            {error}
          </pre>
        </div>
      )}

      {result && (
        <div className="mt-6 w-full max-w-2xl bg-green-900/30 border border-green-700 p-4 rounded">
          <h2 className="font-semibold text-green-400 mb-2">Result</h2>
          <pre className="text-sm whitespace-pre-wrap break-words">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
