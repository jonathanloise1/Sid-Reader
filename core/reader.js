"use strict";

// Core reader logic - COMPLETE REWRITE with virtual pagination
(function() {
  // DOM selectors
  const pagesContainer = () => document.getElementById('pages');
  const tocContainer = () => document.getElementById('toc');
  const paginationBar = () => document.getElementById('paginationBar');
  const splashEl = () => document.getElementById('splash');
  const splashTitle = () => document.getElementById('splashTitle');
  
  // State
  let narrative = null;
  let pages = [];
  let currentPage = 0;
  let _saveTimeout = null;
  
  // Single page container (reused for all pages)
  let pageContainer = null;
  
  // Media cache
  const mediaCache = new window.ReaderUtils.MediaCache();
  
  // Pagination configuration
  const PAGES_PER_CHUNK = 20; // Show 20 page numbers at a time
  
  function createPageContainer() {
    if (pageContainer) return pageContainer;
    
    const container = document.createElement('article');
    container.className = 'page'; // Changed from 'page-container' to 'page' for CSS
    container.id = 'currentPageContainer';
    
    return container;
  }
  
  function renderPageContent(pageData) {
    if (!pageContainer) {
      pageContainer = createPageContainer();
      const cont = pagesContainer();
      if (cont) {
        // Clear everything
        cont.innerHTML = '';
        cont.appendChild(pageContainer);
      }
    }
    
    // Clear previous content
    pageContainer.innerHTML = '';
    
    // Add page content
    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';
    
    // Add type indicator
    const typeIndicator = document.createElement('div');
    typeIndicator.className = 'page-type-indicator';
    const typeLabel = getTypeLabel(pageData.type);
    typeIndicator.textContent = typeLabel;
    typeIndicator.setAttribute('data-type', pageData.type);
    
    const title = document.createElement('div');
    title.className = 'page-title';
    title.textContent = pageData.title || '';
    
    const content = document.createElement('div');
    content.className = 'page-text';
    content.textContent = pageData.text || '';
    
    pageContent.appendChild(typeIndicator);
    pageContent.appendChild(title);
    pageContent.appendChild(content);
    
    // Add metadata section if present
    if (pageData.metadata && Object.keys(pageData.metadata).length > 0) {
      const metadataSection = document.createElement('div');
      metadataSection.className = 'page-metadata';
      
      const metadataTitle = document.createElement('div');
      metadataTitle.className = 'metadata-title';
      metadataTitle.textContent = 'Metadata';
      metadataSection.appendChild(metadataTitle);
      
      const metadataList = document.createElement('dl');
      metadataList.className = 'metadata-list';
      
      for (const [key, value] of Object.entries(pageData.metadata)) {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = value;
        metadataList.appendChild(dt);
        metadataList.appendChild(dd);
      }
      
      metadataSection.appendChild(metadataList);
      pageContent.appendChild(metadataSection);
    }
    
    // Add media gallery if present
    if (pageData.media && pageData.media.length > 0) {
      const gallery = window.MediaGallery.createMediaGallery(
        pageData,
        (mediaList, index) => {
          if (window.Lightbox && typeof window.Lightbox.init === 'function') {
            window.Lightbox.init();
          }
          if (window.Lightbox && typeof window.Lightbox.open === 'function') {
            window.Lightbox.open(mediaList, index);
          }
        }
      );
      
      if (gallery) {
        pageContent.appendChild(gallery);
      }
    }
    
    pageContainer.appendChild(pageContent);
    
    // Trigger reflow for animations
    pageContainer.offsetHeight;
    pageContainer.classList.add('active');
  }
  
  function getTypeLabel(type) {
    const labels = {
      'preface': 'Preface',
      'episode': 'Episode',
      'conclusion': 'Conclusion'
    };
    return labels[type] || type || 'Content';
  }
  
  function buildPaginationBar() {
    const bar = paginationBar();
    if (!bar) return;
    
    bar.innerHTML = '';
    
    const totalPages = pages.length;
    const currentChunkStart = Math.floor(currentPage / PAGES_PER_CHUNK) * PAGES_PER_CHUNK;
    const currentChunkEnd = Math.min(currentChunkStart + PAGES_PER_CHUNK, totalPages);
    
    // Previous chunk button
    if (currentChunkStart > 0) {
      const prevChunk = document.createElement('button');
      prevChunk.className = 'page-nav-btn';
      prevChunk.textContent = '«';
      prevChunk.title = `Pages ${currentChunkStart - PAGES_PER_CHUNK + 1}-${currentChunkStart}`;
      prevChunk.onclick = () => goToPage(currentChunkStart - 1);
      bar.appendChild(prevChunk);
    }
    
    // Page numbers in current chunk
    for (let i = currentChunkStart; i < currentChunkEnd; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-number-btn';
      btn.textContent = i + 1;
      btn.dataset.page = i;
      
      if (i === currentPage) {
        btn.classList.add('active');
      }
      
      btn.onclick = () => goToPage(i);
      bar.appendChild(btn);
    }
    
    // Next chunk button
    if (currentChunkEnd < totalPages) {
      const nextChunk = document.createElement('button');
      nextChunk.className = 'page-nav-btn';
      nextChunk.textContent = '»';
      nextChunk.title = `Pages ${currentChunkEnd + 1}-${Math.min(currentChunkEnd + PAGES_PER_CHUNK, totalPages)}`;
      nextChunk.onclick = () => goToPage(currentChunkEnd);
      bar.appendChild(nextChunk);
    }
    
    // Total pages indicator
    const indicator = document.createElement('span');
    indicator.className = 'page-total';
    indicator.textContent = `of ${totalPages}`;
    bar.appendChild(indicator);
  }
  
  function goToPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    if (pageIndex === currentPage) return;
    
    console.log(`📖 Going to page ${pageIndex + 1}`);
    
    currentPage = pageIndex;
    
    // Fade out
    if (pageContainer) {
      pageContainer.classList.remove('active');
    }
    
    setTimeout(() => {
      renderPageContent(pages[currentPage]);
      buildPaginationBar();
      scheduleSave();
      
      // Announce to screen readers
      try {
        const aria = document.getElementById('ariaLive');
        if (aria) aria.textContent = `Page ${currentPage + 1} of ${pages.length}: ${pages[currentPage].title || ''}`;
      } catch (e) {}
    }, 150);
  }
  
  function nextPage() {
    console.log(`➡️ Next page (current: ${currentPage})`);
    if (currentPage < pages.length - 1) {
      goToPage(currentPage + 1);
    }
  }
  
  function prevPage() {
    console.log(`⬅️ Prev page (current: ${currentPage})`);
    if (currentPage > 0) {
      goToPage(currentPage - 1);
    }
  }
  
  
  function buildTOC() {
    const toc = tocContainer();
    if (!toc) return;
    
    toc.innerHTML = '';
    
    // Group pages by type
    const grouped = {};
    pages.forEach((p, i) => {
      const type = p.type || 'episode';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push({ page: p, index: i });
    });
    
    // Define order and labels for types
    const typeOrder = ['preface', 'episode', 'conclusion'];
    const typeLabels = {
      'preface': 'Prefaces',
      'episode': 'Episodes',
      'conclusion': 'Conclusions'
    };
    
    // Render groups in order
    typeOrder.forEach(type => {
      if (grouped[type] && grouped[type].length > 0) {
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'toc-group-header';
        groupHeader.textContent = typeLabels[type] || type;
        toc.appendChild(groupHeader);
        
        // Create group container
        const groupContainer = document.createElement('div');
        groupContainer.className = 'toc-group';
        
        // Add items
        grouped[type].forEach(({ page, index }) => {
          const btn = document.createElement('button');
          btn.className = 'toc-item';
          btn.textContent = page.title || `Page ${index + 1}`;
          btn.onclick = () => {
            goToPage(index);
            closeMenu();
          };
          groupContainer.appendChild(btn);
        });
        
        toc.appendChild(groupContainer);
      }
    });
    
    // Add any other types not in the predefined order
    Object.keys(grouped).forEach(type => {
      if (!typeOrder.includes(type)) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'toc-group-header';
        groupHeader.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        toc.appendChild(groupHeader);
        
        const groupContainer = document.createElement('div');
        groupContainer.className = 'toc-group';
        
        grouped[type].forEach(({ page, index }) => {
          const btn = document.createElement('button');
          btn.className = 'toc-item';
          btn.textContent = page.title || `Page ${index + 1}`;
          btn.onclick = () => {
            goToPage(index);
            closeMenu();
          };
          groupContainer.appendChild(btn);
        });
        
        toc.appendChild(groupContainer);
      }
    });
  }
  
  function openMenu() {
    document.querySelector('.side-menu')?.classList.add('open');
  }
  
  function closeMenu() {
    document.querySelector('.side-menu')?.classList.remove('open');
  }
  
  function hideSplash() {
    const splash = splashEl();
    if (splash) {
      splash.classList.add('hidden');
    }
  }
  
  function showSplash(title) {
    const splash = splashEl();
    const titleEl = splashTitle();
    if (splash) splash.classList.remove('hidden');
    if (titleEl) titleEl.textContent = title || 'Loading...';
  }
  
  
  function scheduleSave() {
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      window.ReaderUtils.saveCurrentPage(narrative, currentPage);
      _saveTimeout = null;
    }, 400);
  }
  
  function renderNarrative(narr, shouldLoadLastPage = true) {
    narrative = narr;
    pages = window.ReaderUtils.normalize(narr);
    
    if (pages.length === 0) {
      console.error('No pages to render');
      return;
    }
    
    const bookTitle = document.getElementById('bookTitle');
    if (bookTitle) bookTitle.textContent = narr.title || 'Story';
    
    // Only load last page if explicitly requested (not when coming from cover)
    if (shouldLoadLastPage) {
      const lastPage = window.ReaderUtils.loadLastPage(narr);
      currentPage = Math.min(lastPage, pages.length - 1);
    } else {
      currentPage = 0; // Always start from first page when coming from cover
    }
    
    buildTOC();
    renderPageContent(pages[currentPage]);
    buildPaginationBar();
    
    hideSplash();
  }
  
  
  function initControls() {
    console.log('🔧 Initializing reader controls...');
    
    // Initialize menu buttons
    const t = document.getElementById('menuToggle');
    const mc = document.getElementById('menuClose');
    
    if (t) {
      t.onclick = openMenu;
    }
    
    if (mc) {
      mc.onclick = closeMenu;
    }
    
    // Initialize gestures for swipe navigation
    // COMMENTED OUT: Swipe is causing issues with menu and lightbox functionality
    // if (window.ReaderGestures) {
    //   window.ReaderGestures.attachGestures(nextPage, prevPage);
    // }
    
    console.log('✅ Reader controls initialized');
  }
  
  function initWithData(manifest, narr) {
    showSplash('Preparing your story...');
    
    // Build cover overlay with callback to start reading
    window.CoverOverlay.build(manifest, () => {
      doStartReading(narr);
    });
    
    function doStartReading(narrative) {
      showSplash(narrative.title || 'Loading...');
      
      setTimeout(() => {
        // Pass false to NOT load last page - always start from page 0
        renderNarrative(narrative, false);
        hideSplash();
      }, 300);
    }
  }
  
  // Export public API
  window.readerCore = window.readerCore || {};
  window.readerCore.render = renderNarrative;
  window.readerCore.initWithData = initWithData;
  window.readerCore.goToPage = goToPage;
  
  // Initialize controls immediately
  // Scripts with defer run after DOM is ready, so elements exist
  console.log('📚 Reader.js loaded, initializing...');
  initControls();
  
  // Ensure lightbox is initialized early
  setTimeout(() => {
    if (window.Lightbox && typeof window.Lightbox.init === 'function') {
      try {
        window.Lightbox.init();
        console.log('✅ Lightbox initialized');
      } catch (e) {
        console.warn('⚠️ Lightbox init failed:', e);
      }
    }
  }, 100);
})();
