"use strict";

// Gesture handling for page navigation
window.ReaderGestures = (function() {
  
  function attachGestures(onNext, onPrev) {
    const cont = document.getElementById('bookStage');
    if (!cont) return;
    
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let pointerId = null;

    cont.addEventListener('pointerdown', (e) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (e.isPrimary === false) return;
      
      startX = e.clientX;
      startY = e.clientY;
      isDragging = true;
      pointerId = e.pointerId;
      
      try {
        cont.setPointerCapture(pointerId);
      } catch {}
    });

    cont.addEventListener('pointerup', (e) => {
      if (!isDragging || e.pointerId !== pointerId) return;
      
      isDragging = false;
      
      try {
        cont.releasePointerCapture(pointerId);
      } catch {}
      
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const threshold = 80;
      
      // Swipe detection - horizontal only
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
        if (dx > 0) {
          onPrev(); // Swipe right -> previous page
        } else {
          onNext(); // Swipe left -> next page
        }
      }
      
      pointerId = null;
    });

    cont.addEventListener('pointercancel', (e) => {
      if (!isDragging || e.pointerId !== pointerId) return;
      isDragging = false;
      pointerId = null;
    });

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') onNext();
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') onPrev();
    });
  }

  return {
    attachGestures
  };
})();
