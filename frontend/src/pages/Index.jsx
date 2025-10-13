import { useState, useEffect } from "react";
import UploadForm from "../components/UploadForm";
import VideoCard from "../components/VideoCard";

export default function Index() {
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);

  useEffect(() => {
    // Fetch existing videos from backend
    // Example: fetch("/api/videos").then(res => res.json()).then(setVideos)
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6 text-center">
          Recolekt Reels
        </h1>

        <UploadForm
          onResult={(video) => setVideos((prev) => [video, ...prev])}
        />

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <VideoCard
              key={video.id || video.download}
              data={video}
              onClick={() => setSelectedVideo(video)}
            />
          ))}
        </div>

        {selectedVideo && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg max-w-lg w-full relative">
              <button
                onClick={() => setSelectedVideo(null)}
                className="absolute top-2 right-2 text-white text-xl font-bold"
              >
                ×
              </button>
              <video
                src={selectedVideo.download}
                controls
                className="w-full rounded-lg"
              />
              <h2 className="mt-4 text-xl font-semibold">
                {selectedVideo.title}
              </h2>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
