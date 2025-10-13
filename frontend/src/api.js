export async function fetchVideo(url) {
  const response = await fetch("http://127.0.0.1:5001/api/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to fetch video");
  }
  return response.json();
}
