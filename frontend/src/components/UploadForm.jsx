import { useState } from "react";

export default function UploadForm({ onResult }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5001/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to fetch video");
      const data = await res.json();
      onResult(data);
      setUrl("");
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 max-w-xl mx-auto mb-6"
    >
      <input
        type="text"
        placeholder="Paste Instagram Reel URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="flex-1 p-2 rounded border border-gray-600 bg-gray-800 text-white"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Fetch"}
      </button>
    </form>
  );
}
