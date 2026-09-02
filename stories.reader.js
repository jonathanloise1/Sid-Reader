"use strict";

(function () {
  const DEFAULT_GATEWAYS = [
    "https://ipfs.io",
    "https://dweb.link"
  ];

  const FETCH_TIMEOUT_MS = 15000;

  // Link shorteners / social apps (e.g. Instagram link-in-bio) may re-percent-encode
  // an already-encoded URL, turning "https%3A%2F%2F..." into "https%25253A...".
  // Decode repeatedly until stable so we recover the original value.
  function deepDecode(value) {
    if (!value) return value;
    let out = String(value);
    for (let i = 0; i < 4; i++) {
      let dec;
      try { dec = decodeURIComponent(out); } catch (e) { break; }
      if (dec === out) break;
      out = dec;
    }
    return out.trim();
  }

  // Returns a valid absolute http(s) URL or null (mangled values are discarded
  // so the caller can fall back to the default gateways).
  function sanitizeHttpUrl(value) {
    const v = deepDecode(value);
    return v && /^https?:\/\//i.test(v) ? v : null;
  }

  function showError(message) {
    // The splash overlays everything (z-index 8000): hide it so the error is visible.
    const splash = document.getElementById("splash");
    if (splash) splash.classList.add("hidden");
    const root = document.getElementById("readerRoot") || document.body;
    const box = document.createElement("div");
    box.style.background = "#ffe8e6";
    box.style.border = "1px solid #ffc1bb";
    box.style.color = "#7a1f17";
    box.style.padding = "0.75rem 1rem";
    box.style.margin = "0.5rem 0";
    box.style.borderRadius = "0.5rem";
    box.textContent = message;
    root.prepend(box);
  }

  // fetch with a hard timeout: a blackholed gateway (filtered DNS, dead host)
  // can otherwise hang for minutes and the splash looks frozen.
  function fetchWithTimeout(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const opts = Object.assign({}, init, { signal: ctrl.signal });
    return fetch(url, opts).finally(() => clearTimeout(timer));
  }

  async function fetchWithGateways(url, gateways, init) {
    // Extract the "/ipfs/..." portion so fallback gateways always get a clean
    // path, even when the original URL was mangled upstream.
    const ipfsIdx = url.search(/\/ipfs\//i);

    // If not an IPFS-style URL, just fetch once
    if (ipfsIdx < 0 || !Array.isArray(gateways) || gateways.length === 0) {
      const resp = await fetchWithTimeout(url, init);
      if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`);
      return resp;
    }

    const path = url.slice(ipfsIdx);
    let lastError;
    for (const gw of gateways) {
      const tryUrl = `${gw.replace(/\/$/, "")}${path}`;
      try {
        const resp = await fetchWithTimeout(tryUrl, init);
        if (resp.ok) return resp;
        lastError = new Error(`Fetch failed ${resp.status} @ ${tryUrl}`);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError ?? new Error("All gateway attempts failed");
  }

  function buildManifestUrl({ manifest, cid, gateway }) {
    if (manifest) return manifest;
    if (!cid) return null;
    const base = (gateway || window.ipfsGatewayBase || DEFAULT_GATEWAYS[0]).replace(/\/$/, "");
    return `${base}/ipfs/${cid}/manifest.json`;
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    // Sanitize: discard over-encoded/invalid URLs instead of letting them
    // poison every gateway attempt (the cid alone is enough to load a story).
    const manifestParam = sanitizeHttpUrl(params.get("manifest"));
    const cidParam = deepDecode(params.get("cid"));
    const gatewayParam = sanitizeHttpUrl(params.get("gateway"));

    const manifestUrl = buildManifestUrl({ manifest: manifestParam, cid: cidParam, gateway: gatewayParam });
    if (!manifestUrl) {
      console.error("Missing manifest or cid parameter in URL.");
      showError("Missing manifest or cid parameter in URL.");
      return;
    }

    // Helper: get the package base from manifest URL
    const pkgBase = manifestUrl.replace(/\/manifest\.json(\?.*)?$/i, "");
    const toPackageUrl = (rel) => {
      if (!rel) return "";
      if (typeof rel === "string" && /^https?:\/\//i.test(rel)) return rel;
      const clean = typeof rel === "string" ? rel : String(rel || "");
      return `${pkgBase}/${clean.replace(/^\/+/, "")}`;
    };

    try {
      // Step 1: fetch manifest.json
      const gateways = [gatewayParam, ...(DEFAULT_GATEWAYS.filter(g => !!g))].filter(Boolean);
      const manifestResp = await fetchWithGateways(manifestUrl, gateways, { cache: "no-store" });
      const manifest = await manifestResp.json();

      if (!manifest.assets || !manifest.assets.narrative) {
        throw new Error("Manifest does not contain 'assets.narrative'");
      }

      // Step 2: fetch narrative.json
      const narrativeUrl = toPackageUrl(manifest.assets.narrative);
      const narrativeResp = await fetchWithGateways(narrativeUrl, gateways, { cache: "no-store" });
      const narrative = await narrativeResp.json();

      // Step 2.5: Normalize cover URLs in manifest to use toPackageUrl
      if (manifest.assets && manifest.assets.cover && Array.isArray(manifest.assets.cover)) {
        manifest.assets.cover = manifest.assets.cover.map(c => toPackageUrl(c));
      }

      // Step 3: normalize media (support strings or objects {full, thumb, metadata})
      const inferType = (url) => {
        if (!url) return "image";
        try {
          const u = String(url).split('?')[0].toLowerCase();
          if (u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') || u.endsWith('.mkv') || u.endsWith('.avi')) return 'video';
          if (u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp') || u.endsWith('.gif') || u.endsWith('.bmp')) return 'image';
        } catch {}
        return "image";
      };
      (narrative.content || []).forEach(sec => {
        if (Array.isArray(sec.media)) {
          sec.media = sec.media.map(m => {
            if (typeof m === "string") {
              const u = toPackageUrl(m);
              return { type: inferType(u), full: u, thumb: u, metadata: {} };
            }
            const full = m?.full ? toPackageUrl(m.full) : "";
            const thumb = m?.thumb ? toPackageUrl(m.thumb) : (full || "");
            const metadata = m?.metadata || {};
            const type = inferType(full || thumb);
            return { type, full, thumb, metadata };
          });
        }
      });

      // Step 4: Set pending narrative FIRST so agent can pick it up when loaded
      window.pendingNarrative = narrative;
      
      // Step 5: handoff narrative to AI agent (if already loaded)
      if (window.agent && typeof window.agent.setNarrative === "function") {
        window.agent.setNarrative(narrative);
      }

      // Step 6: Show cover overlay, then render when user clicks Start
      // Use the new initWithData method that handles the cover screen
      if (window.readerCore && typeof window.readerCore.initWithData === "function") {
        window.readerCore.initWithData(manifest, narrative);
      } else {
        // Fallback: render directly if initWithData is not available
        window.readerCore.render(narrative);
      }

    } catch (err) {
      console.error("Error loading story:", err);
      showError("Failed to load story. Check your connection or gateway.");
    }
  });
})();
