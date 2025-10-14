export async function fetchThumbnail(url) {
  const response = await fetch('https://your-render-backend-url/api/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  const data = await response.json();
  return data.thumb;  // The URL or path of the thumbnail image
}
