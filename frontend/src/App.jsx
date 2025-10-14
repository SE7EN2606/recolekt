import { useState } from "react";

function App() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchInstagramData() {
    try {
      setLoading(true);
      setError(null);

      // Extract Instagram ID or URL part
      const match = url.match(/\/(?:reel|p)\/([^/?]+)/);
      const id = match ? match[1] : url;

      const res = await fetch(`https://recolekt.onrender.com/api/instagram?id=${id}`);
      if (!res.ok) throw new Error("Backend error");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Instagram Fetch Test</h1>
      <input
        className="border rounded w-full p-2"
        type="text"
        placeholder="Paste Instagram Reel or Post URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        onClick={fetchInstagramData}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? "Loading..." : "Fetch"}
      </button>

      {error && <p className="text-red-600">Error: {error}</p>}

      {data && (
        <div className="space-y-2">
          <p><strong>User:</strong> {data.user?.username}</p>
          <p><strong>Caption:</strong> {data.caption?.text}</p>
          <p><strong>Likes:</strong> {data.like_count}</p>
          {data.video_versions?.[0]?.url && (
            <video src={data.video_versions[0].url} controls className="w-full rounded" />
          )}
          {data.image_versions2?.candidates?.[0]?.url && (
            <img
              src={data.image_versions2.candidates[0].url}
              alt="Post"
              className="w-full rounded"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
