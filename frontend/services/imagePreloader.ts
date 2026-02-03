export const preloadImages = (urls: string[]) => {
  urls.forEach(url => {
    if (!url) return;
    
    const img = new Image();
    img.src = url;
    
    // Store in window to prevent garbage collection
    if (!(window as any).preloadedImages) {
      (window as any).preloadedImages = [];
    }
    (window as any).preloadedImages.push(img);
  });
};
