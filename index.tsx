const handleSaveVideo = async () => {
  if (!pasteLink.trim()) {
    toast({ title: "Error", description: "Please paste an Instagram link", variant: "destructive" });
    return;
  }

  if (!pasteLink.includes("instagram.com")) {
    toast({ title: "Error", description: "Enter a valid Instagram URL", variant: "destructive" });
    return;
  }

  setIsSaving(true);
  try {
    // Replace Supabase function call with Flask API
const response = await fetch("http://127.0.0.1:5001/fetch-thumbnail", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: pasteLink }),
});
const data = await response.json();
setThumbnail(data.thumbnail_url); // or update your VideoCard


    if (!response.ok) throw new Error(data.error || "Failed to fetch thumbnail");

    toast({ title: "Success", description: "Thumbnail generated!" });

    // Optionally, add it to your local video state for display
    setVideos((prev) => [
      {
        id: data.thumbnail_url, // use reel id or generated
        thumbnail: `http://188.165.53.185:5000${data.thumbnail_url}`,
        title: pasteLink,
        instagramUrl: pasteLink,
      },
      ...prev,
    ]);

    setPasteLink("");
  } catch (err: any) {
    console.error(err);
    toast({ title: "Error", description: err.message, variant: "destructive" });
  } finally {
    setIsSaving(false);
  }
};
