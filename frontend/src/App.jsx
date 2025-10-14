import { useState } from "react";

function App() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const handleFetch = async () => {
    setResult("");
    setError("");

    try {
      const res = await fetch("https://https://recolekt.onrender.com/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(JSON.stringify(data));
      } else {
        setResult(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setError("Frontend fetch error: " + e.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Instagram RapidAPI Fetch</h1>
      <input
        style={{ width: "400px" }}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste Instagram reel URL here"
      />
      <button onClick={handleFetch}>Fetch</button>
      {result && <pre style={{ background: "#eee", padding: 10 }}>{result}</pre>}
      {error && <pre style={{ background: "#fee", padding: 10 }}>{error}</pre>}
    </div>
  );
}

export default App;
