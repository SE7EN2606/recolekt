import React from 'react';
import { useState } from "react";
import UploadForm from "./components/UploadForm";
import VideoCard from "./components/VideoCard";

export default function App() {
  const [video, setVideo] = useState(null);
  return (
    <div className="max-w-xl mx-auto mt-10">
      <h1 className="text-2xl font-bold mb-4">Recolekt Reels</h1>
      <UploadForm onResult={setVideo} />
      {video && <VideoCard data={video} />}
    </div>
  );
}