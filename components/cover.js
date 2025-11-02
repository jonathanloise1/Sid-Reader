"use strict";

// Cover overlay component with carousel
window.CoverOverlay = (function() {
  const { resolveUrl } = window.ReaderUtils;
  
  let coverElement = null;
  let currentSlide = 0;
  let autoScrollInterval = null;
  
  function build(manifest, onStart) {
    const covers = manifest?.assets?.cover || [];
    if (covers.length === 0) {
      // No cover, just start immediately
      if (onStart) onStart();
      return;
    }
    
    const coverDiv = document.createElement('div');
    coverDiv.className = 'cover-overlay';
    coverDiv.dataset.count = covers.length;
    
    const card = document.createElement('div');
    card.className = 'cover-card';
    
    const title = document.createElement('h1');
    title.className = 'cover-title';
    title.textContent = manifest.title || 'Story';
    card.appendChild(title);
    
    // Carousel container
    const carousel = document.createElement('div');
    carousel.className = 'cover-carousel';
    
    covers.forEach((coverUrl, idx) => {
      const slide = document.createElement('div');
      slide.className = 'cover-slide';
      slide.dataset.index = idx;
      if (idx === 0) slide.classList.add('active');
      
      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'cover-media';
      
      const url = resolveUrl(coverUrl);
      const isVideo = /\.(mp4|mov|webm|mkv|avi)(\?|$)/i.test(url);
      
      if (isVideo) {
        const video = document.createElement('video');
        video.className = 'cover-video';
        video.src = url;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        mediaWrap.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.className = 'cover-img';
        img.src = url;
        img.alt = 'Cover';
        mediaWrap.appendChild(img);
      }
      
      slide.appendChild(mediaWrap);
      carousel.appendChild(slide);
    });
    
    card.appendChild(carousel);
    
    // Controls (only if multiple covers)
    if (covers.length > 1) {
      const controls = document.createElement('div');
      controls.className = 'cover-controls';
      
      const prevBtn = document.createElement('button');
      prevBtn.className = 'cover-nav prev';
      prevBtn.innerHTML = '‹';
      prevBtn.setAttribute('aria-label', 'Previous cover');
      prevBtn.addEventListener('click', () => navigateCover(-1));
      
      const nextBtn = document.createElement('button');
      nextBtn.className = 'cover-nav next';
      nextBtn.innerHTML = '›';
      nextBtn.setAttribute('aria-label', 'Next cover');
      nextBtn.addEventListener('click', () => navigateCover(1));
      
      const dots = document.createElement('div');
      dots.className = 'cover-dots';
      for (let i = 0; i < covers.length; i++) {
        const dot = document.createElement('button');
        dot.className = 'cover-dot';
        dot.dataset.index = i;
        if (i === 0) dot.classList.add('active');
        dot.setAttribute('aria-label', `Go to cover ${i + 1}`);
        dot.addEventListener('click', () => goToCover(i));
        dots.appendChild(dot);
      }
      
      controls.appendChild(prevBtn);
      controls.appendChild(dots);
      controls.appendChild(nextBtn);
      card.appendChild(controls);
      
      // Auto-scroll every 4 seconds
      startAutoScroll();
    }
    
    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'cover-start';
    startBtn.textContent = 'Start Reading';
    startBtn.addEventListener('click', () => {
      stopAutoScroll();
      hide();
      if (onStart) onStart();
    });
    card.appendChild(startBtn);
    
    coverDiv.appendChild(card);
    
    const root = document.querySelector('.reader-root');
    if (root) {
      root.prepend(coverDiv);
      coverElement = coverDiv;
    }
  }
  
  function navigateCover(direction) {
    if (!coverElement) return;
    
    const slides = coverElement.querySelectorAll('.cover-slide');
    const dots = coverElement.querySelectorAll('.cover-dot');
    
    currentSlide += direction;
    
    if (currentSlide < 0) currentSlide = slides.length - 1;
    if (currentSlide >= slides.length) currentSlide = 0;
    
    updateSlides(slides, dots);
    
    // Reset auto-scroll timer
    stopAutoScroll();
    startAutoScroll();
  }
  
  function goToCover(index) {
    if (!coverElement) return;
    
    const slides = coverElement.querySelectorAll('.cover-slide');
    const dots = coverElement.querySelectorAll('.cover-dot');
    
    currentSlide = index;
    updateSlides(slides, dots);
    
    // Reset auto-scroll timer
    stopAutoScroll();
    startAutoScroll();
  }
  
  function updateSlides(slides, dots) {
    slides.forEach((slide, idx) => {
      if (idx === currentSlide) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });
    
    dots.forEach((dot, idx) => {
      if (idx === currentSlide) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }
  
  function startAutoScroll() {
    if (!coverElement) return;
    
    const count = parseInt(coverElement.dataset.count || '0');
    if (count <= 1) return; // Don't auto-scroll single cover
    
    autoScrollInterval = setInterval(() => {
      navigateCover(1);
    }, 4000);
  }
  
  function stopAutoScroll() {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }
  
  function hide() {
    if (coverElement) {
      coverElement.classList.add('hidden');
    }
  }
  
  function show() {
    if (coverElement) {
      coverElement.classList.remove('hidden');
    }
  }
  
  return {
    build,
    hide,
    show
  };
})();
