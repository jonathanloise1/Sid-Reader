"use strict";

// Lightbox component with navigation - REFACTORED
window.Lightbox = (function() {
  const { resolveUrl } = window.ReaderUtils;
  
  let gallery = [];
  let galleryIndex = 0;
  let lightboxElement = null;
  let keyboardHandler = null;
  let initAttempts = 0;
  const MAX_INIT_ATTEMPTS = 10;
  
  function ensureLightbox() {
    if (lightboxElement) return true;
    
    const root = document.querySelector('.reader-root');
    if (!root) {
      if (initAttempts < MAX_INIT_ATTEMPTS) {
        initAttempts++;
        console.warn(`Lightbox: .reader-root not found (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS})`);
      }
      return false;
    }
    
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <div class="lb-inner">
        <button class="close-btn" aria-label="Close">&times;</button>
        <button class="lb-nav lb-prev" aria-label="Previous">‹</button>
        <button class="lb-nav lb-next" aria-label="Next">›</button>
        <img class="lb-img" src="" alt="" style="display:none;" />
        <video class="lb-video" controls playsinline preload="metadata" autoplay loop muted style="display:none;"></video>
        <div class="lb-counter"></div>
      </div>
    `;
    
    root.appendChild(lb);
    lightboxElement = lb;
    
    // Attach event listeners
    lb.querySelector('.close-btn').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    
    lb.querySelector('.lb-prev').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(-1);
    });
    
    lb.querySelector('.lb-next').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(1);
    });
    
    lb.addEventListener('click', (e) => {
      if (e.target === lb) {
        e.preventDefault();
        close();
      }
    });
    
    // Keyboard navigation
    keyboardHandler = (e) => {
      if (!lightboxElement || !lightboxElement.classList.contains('active')) return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(1);
      }
    };
    
    document.addEventListener('keydown', keyboardHandler);
    
    console.log('✅ Lightbox created and attached to DOM');
    return true;
  }
  
  function open(mediaList, index) {
    // Retry initialization if needed
    let retries = 0;
    const tryInit = () => {
      if (ensureLightbox()) {
        doOpen(mediaList, index);
      } else if (retries < 3) {
        retries++;
        setTimeout(tryInit, 100);
      } else {
        console.error('Lightbox: Failed to initialize after 3 retries');
      }
    };
    tryInit();
  }
  
  function doOpen(mediaList, index) {
    gallery = mediaList || [];
    galleryIndex = index || 0;
    
    renderCurrent();
    
    if (lightboxElement) {
      lightboxElement.classList.add('active');
      console.log('🖼️ Lightbox opened');
    }
  }
  
  function close() {
    if (!lightboxElement) return;
    
    lightboxElement.classList.remove('active');
    
    const img = lightboxElement.querySelector('.lb-img');
    const vid = lightboxElement.querySelector('.lb-video');
    
    if (img) {
      img.src = '';
      img.style.display = 'none';
    }
    
    if (vid) {
      try {
        vid.pause();
      } catch {}
      vid.removeAttribute('src');
      vid.load();
      vid.style.display = 'none';
    }
  }
  
  function navigate(direction) {
    galleryIndex += direction;
    
    if (galleryIndex < 0) galleryIndex = 0;
    if (galleryIndex >= gallery.length) galleryIndex = gallery.length - 1;
    
    renderCurrent();
  }
  
  function renderCurrent() {
    if (!lightboxElement) return;
    
    const item = gallery[galleryIndex] || {};
    const img = lightboxElement.querySelector('.lb-img');
    const vid = lightboxElement.querySelector('.lb-video');
    const counter = lightboxElement.querySelector('.lb-counter');
    const prevBtn = lightboxElement.querySelector('.lb-prev');
    const nextBtn = lightboxElement.querySelector('.lb-next');
    
    const srcFull = resolveUrl(item.full || item.thumb || '');
    
    // Update counter
    if (counter) {
      counter.textContent = `${galleryIndex + 1} / ${gallery.length}`;
    }
    
    // Update navigation buttons
    if (prevBtn) prevBtn.disabled = galleryIndex === 0;
    if (nextBtn) nextBtn.disabled = galleryIndex === gallery.length - 1;
    
    if (item.type === 'video') {
      if (img) img.style.display = 'none';
      
      if (vid) {
        vid.style.display = 'block';
        if (vid.src !== srcFull) {
          try {
            vid.pause();
          } catch {}
          vid.removeAttribute('src');
          vid.load();
          vid.src = srcFull;
          vid.muted = true; // Ensure muted for autoplay
          vid.loop = true;  // Loop video
          
          // Try to play (autoplay might be blocked without user interaction)
          setTimeout(() => {
            vid.play().catch(e => {
              console.log('Autoplay blocked, video requires user interaction');
            });
          }, 100);
        }
      }
    } else {
      if (vid) {
        vid.style.display = 'none';
        try {
          vid.pause();
        } catch {}
        vid.removeAttribute('src');
        vid.load();
      }
      
      if (img) {
        img.style.display = 'block';
        img.src = srcFull;
      }
    }
  }
  
  return {
    open,
    close,
    init: ensureLightbox // Expose init for explicit initialization
  };
})();

// Initialize lightbox when DOM is ready with retry logic
(function initLightbox() {
  const tryInit = () => {
    if (document.querySelector('.reader-root')) {
      if (window.Lightbox && window.Lightbox.init) {
        const success = window.Lightbox.init();
        if (success) {
          console.log('✅ Lightbox auto-initialized on page load');
        }
      }
    } else {
      // Retry if DOM not ready
      setTimeout(tryInit, 50);
    }
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
