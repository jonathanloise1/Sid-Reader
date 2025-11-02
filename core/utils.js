"use strict";

// Utilities for reader core
window.ReaderUtils = (function() {
  
  // Resolve asset URLs: if not absolute, try to prefix with ipfs gateway base when available
  function resolveUrl(u) {
    try {
      if (!u) return u;
      if (/^\s*data:/.test(u)) return u;
      if (/^https?:\/\//i.test(u)) return u;
      if (window.ipfsGatewayBase) {
        return window.ipfsGatewayBase.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
      }
      return u;
    } catch (e) {
      return u;
    }
  }

  // Normalize narrative structure
  function normalize(narr) {
    return (narr.content || []).map((sec, idx) => ({
      index: idx,
      type: sec.type || 'episode', // default to episode if not specified
      title: sec.title || sec.type || `Page ${idx + 1}`,
      text: sec.content || '',
      media: Array.isArray(sec.media) ? sec.media : [],
      metadata: sec.metadata || {}
    }));
  }

  // Session storage helpers
  function saveCurrentPage(narrative, current) {
    try {
      if (!narrative || !narrative.title) return;
      const key = `sid:lastpage:${narrative.title.replace(/\s+/g, '_')}`;
      const payload = {
        index: current,
        updated: new Date().toISOString()
      };
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save page:', e);
    }
  }

  function loadLastPage(narrative) {
    try {
      if (!narrative || !narrative.title) return 0;
      const key = `sid:lastpage:${narrative.title.replace(/\s+/g, '_')}`;
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const payload = JSON.parse(stored);
        return payload.index || 0;
      }
    } catch (e) {
      console.error('Failed to load last page:', e);
    }
    return 0;
  }

  // Minimal in-memory MediaCache with Cache API hinting
  class MediaCache {
    constructor() {
      this.map = new Map(); // url -> {objectUrl, size, last}
      this.total = 0;
      this.queue = new Map();
      this.maxBytes = this.deriveMaxBytes();
    }

    deriveMaxBytes() {
      try {
        const mem = navigator.deviceMemory || 4;
        if (mem >= 8) return 600 * 1024 * 1024;
        if (mem >= 4) return 300 * 1024 * 1024;
        return 120 * 1024 * 1024;
      } catch (e) {
        return 200 * 1024 * 1024;
      }
    }

    touch(url) {
      if (this.map.has(url)) {
        this.map.get(url).last = Date.now();
      }
    }

    async ensure(url) {
      if (!url) return null;
      if (this.map.has(url)) {
        this.touch(url);
        return this.map.get(url).objectUrl;
      }
      if (this.queue.has(url)) {
        return this.queue.get(url);
      }
      const promise = this._fetch(url);
      this.queue.set(url, promise);
      return promise;
    }

    async _fetch(url) {
      try {
        const resp = await fetch(url, { cache: 'force-cache' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const size = blob.size;
        this._evictIfNeeded(size);
        const objectUrl = URL.createObjectURL(blob);
        this.map.set(url, { objectUrl, size, last: Date.now() });
        this.total += size;
        this.queue.delete(url);
        
        // Hint Cache API
        if ('caches' in window) {
          caches.open('reader-media').then(c => c.put(url, new Response(blob))).catch(() => {});
        }
        
        return objectUrl;
      } catch (e) {
        this.queue.delete(url);
        throw e;
      }
    }

    _evictIfNeeded(incoming) {
      while (this.total + incoming > this.maxBytes && this.map.size > 0) {
        let oldest = null;
        let oldestTime = Infinity;
        for (const [k, v] of this.map.entries()) {
          if (v.last < oldestTime) {
            oldestTime = v.last;
            oldest = k;
          }
        }
        if (oldest) {
          const entry = this.map.get(oldest);
          try {
            URL.revokeObjectURL(entry.objectUrl);
          } catch {}
          this.total -= entry.size;
          this.map.delete(oldest);
        }
      }
    }

    clear() {
      for (const [, v] of this.map.entries()) {
        try {
          URL.revokeObjectURL(v.objectUrl);
        } catch {}
      }
      this.map.clear();
      this.total = 0;
    }
  }

  // Export public API
  return {
    resolveUrl,
    normalize,
    saveCurrentPage,
    loadLastPage,
    MediaCache
  };
})();
