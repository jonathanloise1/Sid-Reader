"use strict";

(function () {
  const DEFAULT_GATEWAYS = [
    "https://ipfs.io",
    "https://dweb.link",
    "https://cloudflare-ipfs.com"
  ];

  function showError(message) {
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

  function isIpfsUrl(url) {
    return /\/ipfs\//i.test(url);
  }

  async function fetchWithGateways(url, gateways, init) {
    // If not an IPFS-style URL, just fetch once
    if (!isIpfsUrl(url) || !Array.isArray(gateways) || gateways.length === 0) {
      const resp = await fetch(url, init);
      if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`);
      return resp;
    }

    // Replace the origin/gateway portion and try sequentially
    const m = url.match(/^(https?:\/\/[^/]+)(.*)$/i);
    const path = m ? m[2] : url;
    let lastError;
    for (const gw of gateways) {
      const tryUrl = `${gw.replace(/\/$/, "")}${path}`;
      try {
        const resp = await fetch(tryUrl, init);
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
    const manifestParam = params.get("manifest");
    const cidParam = params.get("cid");
    const gatewayParam = params.get("gateway");

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
