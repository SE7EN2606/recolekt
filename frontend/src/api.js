export async function fetchThumbnail(url) {
  const response = await fetch('https://recolekt.onrender.com/api/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  const data = await response.json();
  return data.thumb;  // The URL or path of the thumbnail image
}
