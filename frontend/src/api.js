// src/components/api.js

export const fetchThumbnail = async (url) => {
  // Your logic to fetch the thumbnail from the provided Instagram URL.
  try {
    const response = await fetch(`https://api.recolekt.onrender.com/api/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    return data.thumb;  // Assuming the thumbnail URL is in the `thumb` field of the response.
  } catch (error) {
    throw new Error("Error fetching thumbnail");
  }
};
