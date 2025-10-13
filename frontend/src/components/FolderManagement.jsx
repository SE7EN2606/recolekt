import { useState } from "react";
import { fetchVideo } from "../api";

export default function UploadForm({ onResult }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await fetchVideo(url);
      onResult(data);
    } catch (err) {
      alert("Failed: " + err.message);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 flex gap-2">
      <input
        type="text"
        placeholder="Paste Instagram Reel URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="border p-2 flex-1"
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2"
        disabled={loading}
      >
        {loading ? "Processing..." : "Fetch"}
      </button>
    </form>
  );
}