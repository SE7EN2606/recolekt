const API = import.meta.env.VITE_API_URL || "http://localhost:5001";

export async function fetchVideo(url) {
  const resp = await fetch(`${API}/api/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || resp.statusText);
  }
  return resp.json();
}
