// Enhanced Service Worker: precache core assets and runtime cache for thumbs, images and on-demand media
const CACHE_STATIC = 'sid-reader-static-v3';
const CACHE_THUMBS = 'sid-reader-thumbs-v1';
const CACHE_MEDIA = 'sid-reader-media-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/vendor/bootstrap.min.css',
  '/core/reader.css',
  '/core/reader.js',
  '/stories.reader.js',
  '/sw.js'
];

// Basic install/activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      // Cache each URL individually so one missing file does not abort the whole install
      .then(cache => Promise.all(PRECACHE_URLS.map(u => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => { event.waitUntil(clients.claim()); });

// Message API: client can request cache/evict specific URLs
self.addEventListener('message', (ev) => {
  const data = ev.data || {};
  // Simple IndexedDB helper for metadata
  function openMetaDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('sid-reader-meta', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('media')) {
          const s = db.createObjectStore('media', { keyPath: 'url' });
          s.createIndex('by-last', 'last');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function putMeta(url, size) {
    try {
      const db = await openMetaDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        const req = store.put({ url, size: size || 0, last: Date.now() });
        req.onsuccess = () => {};
        req.onerror = () => {};
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }
  async function delMeta(url) {
    try {
      const db = await openMetaDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        const req = store.delete(url);
        req.onsuccess = () => {};
        req.onerror = () => {};
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }
  async function getAllMeta() {
    try {
      const db = await openMetaDB();
      const tx = db.transaction('media', 'readonly');
      const store = tx.objectStore('media');
      return new Promise((res, rej) => {
        const items = [];
        const r = store.openCursor();
        r.onsuccess = (e) => { const cur = e.target.result; if (cur) { items.push(cur.value); cur.continue(); } else res(items); };
        r.onerror = () => rej(r.error);
      });
    } catch (e) { return []; }
  }

  // Default max bytes heuristics
  let MAX_BYTES = (function(){ try { const mem = navigator.deviceMemory || 4; if (mem >= 8) return 600*1024*1024; if (mem >=4) return 300*1024*1024; return 120*1024*1024; } catch(e){ return 200*1024*1024; } })();

  async function evictIfNeeded() {
    try {
      const items = await getAllMeta();
      let total = items.reduce((s,i)=>s+(i.size||0),0);
      if (total <= MAX_BYTES) return { total, maxBytes: MAX_BYTES };
      // sort by last ascending (oldest first)
      items.sort((a,b)=>a.last - b.last);
      const cache = await caches.open(CACHE_MEDIA);
      for (const it of items) {
        if (total <= MAX_BYTES) break;
        try { await cache.delete(it.url); } catch(e){}
        try { await delMeta(it.url); } catch(e){}
        total -= it.size || 0;
      }
      return { total, maxBytes: MAX_BYTES };
    } catch (e) { return { total:0, maxBytes: MAX_BYTES }; }
  }

  // handle messages
  if (data && data.type === 'set-max-bytes') {
    if (data.maxBytes && Number.isFinite(data.maxBytes)) MAX_BYTES = data.maxBytes;
    return;
  }
  if (data && data.type === 'cache-url' && data.url) {
    // fetch, cache, compute size and write meta then evict if needed
    (async () => {
      try {
        const resp = await fetch(data.url);
        if (!resp || !resp.ok) return;
        const cache = await caches.open(CACHE_MEDIA);
        await cache.put(data.url, resp.clone());
        // determine size from header or body
        let size = 0;
        const cl = resp.headers.get('content-length');
        if (cl) size = parseInt(cl,10) || 0;
        else {
          try { const buf = await resp.clone().arrayBuffer(); size = buf.byteLength || 0; } catch(e) { size = 0; }
        }
        await putMeta(data.url, size);
        await evictIfNeeded();
      } catch (e) {}
    })();
    return;
  }
  if (data && data.type === 'evict-url' && data.url) {
    (async () => {
      try { const cache = await caches.open(CACHE_MEDIA); await cache.delete(data.url); await delMeta(data.url); await evictIfNeeded(); } catch(e){}
    })();
    return;
  }
  if (data && data.type === 'cache-stats') {
    (async () => {
      const items = await getAllMeta();
      const total = items.reduce((s,i)=>s+(i.size||0),0);
      // reply to caller if port provided
      try {
        if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ totalBytes: total, maxBytes: MAX_BYTES });
      } catch (e) {}
    })();
    return;
  }
});

// Helper to try cache first then network and optionally cache for media
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) await cache.put(request, resp.clone());
    return resp;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // JSON: network-first
  if (url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(event.request);
        if (resp && resp.ok) {
          const s = await caches.open(CACHE_STATIC);
          s.put(event.request, resp.clone());
        }
        return resp;
      } catch (e) {
        return caches.match(event.request);
      }
    })());
    return;
  }

  // Thumbnails & images: cache-first (fast)
  if (/\/thumbs\/|\/media\/thumbs\/|\.(jpg|jpeg|png|webp|gif)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request, CACHE_THUMBS));
    return;
  }

  // Media (video/audio): try cache first for media cache, otherwise network but do not cache automatically large media
  if (/\.(mp4|mov|webm|m4v|mp3|wav)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_MEDIA);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // If no cached media, stream from network (do not auto-cache large responses)
      try {
        return await fetch(event.request);
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // default: network fallback to cache
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
