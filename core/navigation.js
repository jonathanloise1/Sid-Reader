"use strict";

// Navigation controller - Handles ALL navigation logic
window.ReaderNavigation = (function() {
  
  let onNextCallback = null;
  let onPrevCallback = null;
  let initialized = false;
  
  function init(callbacks) {
    if (initialized) {
      console.warn('⚠️ Navigation already initialized');
      return;
    }
    
    console.log('🧭 Initializing Navigation Controller...');
    
    onNextCallback = callbacks.onNext;
    onPrevCallback = callbacks.onPrev;
    
    // Wait for buttons to exist
    const checkAndAttach = () => {
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      
      if (!prevBtn || !nextBtn) {
        console.log('⏳ Buttons not ready, waiting...');
        setTimeout(checkAndAttach, 50);
        return;
      }
      
      console.log('✅ Buttons found, attaching handlers...');
      
      // Remove any existing handlers
      const newPrev = prevBtn.cloneNode(true);
      const newNext = nextBtn.cloneNode(true);
      prevBtn.parentNode.replaceChild(newPrev, prevBtn);
      nextBtn.parentNode.replaceChild(newNext, nextBtn);
      
      // Attach new handlers
      newPrev.addEventListener('click', handlePrevClick, { capture: false, passive: false });
      newNext.addEventListener('click', handleNextClick, { capture: false, passive: false });
      
      // Also attach to mousedown for immediate response
      newPrev.addEventListener('mousedown', (e) => {
        e.preventDefault();
        console.log('🖱️ Prev MOUSEDOWN');
      });
      
      newNext.addEventListener('mousedown', (e) => {
        e.preventDefault();
        console.log('🖱️ Next MOUSEDOWN');
      });
      
      console.log('✅ Navigation handlers attached');
      initialized = true;
    };
    
    checkAndAttach();
  }
  
  function handlePrevClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    console.log('⬅️ PREV CLICKED');
    
    if (onPrevCallback) {
      console.log('   Calling prev callback...');
      onPrevCallback();
    } else {
      console.error('   ❌ No prev callback registered!');
    }
  }
  
  function handleNextClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    console.log('➡️ NEXT CLICKED');
    
    if (onNextCallback) {
      console.log('   Calling next callback...');
      onNextCallback();
    } else {
      console.error('   ❌ No next callback registered!');
    }
  }
  
  function updateButtons(currentPage, totalPages) {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn) {
      prevBtn.disabled = currentPage === 0;
    }
    
    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages - 1;
    }
  }
  
  return {
    init,
    updateButtons
  };
})();
