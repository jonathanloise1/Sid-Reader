"use strict";

// Media gallery component
window.MediaGallery = (function() {
  const { resolveUrl } = window.ReaderUtils;
  
  function createMediaGallery(pageData, onMediaClick) {
    if (!pageData.media || pageData.media.length === 0) return null;
    
    const gallery = document.createElement('div');
    gallery.className = 'media-gallery';
    
    // Store media data for delegation
    gallery._mediaData = pageData.media;
    gallery._onMediaClick = onMediaClick;
    
    pageData.media.forEach((m, i) => {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'media-thumb';
      thumbWrap.dataset.mediaIndex = i;
      
      if (m.type === 'video') {
        // Video as Live Photo: autoplay, muted, loop
        const video = document.createElement('video');
        video.src = resolveUrl(m.full || m.thumb || '');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('preload', 'metadata');
        thumbWrap.appendChild(video);
      } else {
        // Image thumbnail
        const img = document.createElement('img');
        img.src = resolveUrl(m.thumb || m.full || '');
        img.alt = (m.metadata && m.metadata.caption) || pageData.title || 'media';
        img.loading = 'lazy';
        img.decoding = 'async';
        thumbWrap.appendChild(img);
      }
      
      gallery.appendChild(thumbWrap);
    });
    
    // Single event listener for the entire gallery (event delegation)
    gallery.addEventListener('click', (e) => {
      const thumb = e.target.closest('.media-thumb');
      if (!thumb) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const index = parseInt(thumb.dataset.mediaIndex, 10);
      if (!isNaN(index) && gallery._onMediaClick) {
        gallery._onMediaClick(gallery._mediaData, index);
      }
    });
    
    return gallery;
  }

  return {
    createMediaGallery
  };
})();
