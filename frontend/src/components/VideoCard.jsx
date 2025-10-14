import React, { useState } from 'react';
import { fetchThumbnail } from '../api';  // Corrected import path

function VideoCard() {
  const [url, setUrl] = useState('');
  const [thumbnail, setThumbnail] = useState(null);

  const handleFetchThumbnail = async () => {
    try {
      const thumbnailUrl = await fetchThumbnail(url);
      setThumbnail(thumbnailUrl);  // Set the thumbnail to display
    } catch (error) {
      console.error("Error fetching thumbnail:", error);
    }
  };

  return (
    <div>
      <input 
        type="text" 
        value={url} 
        onChange={(e) => setUrl(e.target.value)} 
        placeholder="Enter Instagram Reel URL" 
      />
      <button onClick={handleFetchThumbnail}>Fetch Thumbnail</button>

      {thumbnail && <img src={thumbnail} alt="Thumbnail" />}
    </div>
  );
}

export default VideoCard;
