"use strict";

window.agent = (function () {
  // ---------------------------
  // Config
  // ---------------------------
  const EMBEDDING_MODEL = "text-embedding-3-large";
  const CHAT_MODEL = "gpt-4o";
  const TOP_K = 5;            // retrieved blocks
  const CHUNK_SIZE = 800;     // words
  const CHUNK_OVERLAP = 100;  // words

  // ---------------------------
  // State
  // ---------------------------
  let apiKey = null;
  let narrative = null;
  let storyLanguage = "en";
  let blocks = [];       // flattened text blocks
  let vectors = [];      // embeddings aligned to blocks
  let isIndexBuilt = false;
  let isResizing = false;

  // ---------------------------
  // DOM
  // ---------------------------
  const fab = document.getElementById("narratorFab");
  const panel = document.getElementById("narratorPanel");
  const closeBtn = document.getElementById("closeNarrator");
  const apiKeyStep = document.getElementById("apiKeyStep");
  const chatStep = document.getElementById("chatStep");
  const chatMessages = document.getElementById("chatMessages");
  const textarea = document.getElementById("question");
  const btnEnable = document.getElementById("btnEnableAI");
  const btnAsk = document.getElementById("btnAsk");
  const resizeHandle = document.getElementById("resizeHandle");

  // ---------------------------
  // Utils
  // ---------------------------

  function getLangFromCode(code) {
    if (!code) return "en";
    const c = String(code).toLowerCase();
    if (c.startsWith("it")) return "it";
    if (c.startsWith("en")) return "en";
    if (c.startsWith("es")) return "es";
    if (c.startsWith("fr")) return "fr";
    if (c.startsWith("de")) return "de";
    return c.slice(0, 2); // fallback first two letters
  }

  function normalizeLocation(raw) {
    // examples: "45,79:9,11" → "45.79, 9.11"
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();
    s = s.replace(/,/g, ".");    // decimal commas → dots
    s = s.replace(/[:;|]/g, ","); // separators → comma
    // ensure "lat, lon"
    const parts = s.split(",").map(x => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const lat = parts[0];
      const lon = parts[1];
      return `${lat}, ${lon}`;
    }
    return s;
  }

  function chunkWords(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const words = (text || "").split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < words.length; i += (size - overlap)) {
      out.push(words.slice(i, i + size).join(" "));
    }
    return out;
  }

  function buildFlattenedBlocks(narr) {
    const list = [];

    // story-level block (helps author/language questions)
    const storyBlock = [
      `STORY_TITLE: ${narr.title ?? ""}`.trim(),
      `AUTHOR: ${narr.author ?? ""}`.trim(),
      `LANGUAGE: ${narr.language ?? ""}`.trim()
    ].filter(Boolean).join("\n");
    if (storyBlock.trim().length) list.push(storyBlock);

    // section-level
    (narr.content || []).forEach((sec, idx) => {
      const type = sec.type ?? "section";
      const title = (sec.title || sec.type || `Section ${idx + 1}`).replace(/^"+|"+$/g, ""); // trim quotes
      const date = (sec.metadata && (sec.metadata.date || sec.metadata.Date)) ? (sec.metadata.date || sec.metadata.Date) : "";
      const locRaw = (sec.metadata && (sec.metadata.location || sec.metadata.Location)) ? (sec.metadata.location || sec.metadata.Location) : "";
      const location = normalizeLocation(locRaw);
      const mediaArr = Array.isArray(sec.media) ? sec.media : [];
      const mediaList = mediaArr.join(", ");
      const mediaCount = mediaArr.length;

      const header = [
        `TYPE: ${type}`,
        `TITLE: ${title}`,
        date ? `DATE: ${date}` : null,
        location ? `LOCATION: ${location}` : null,
        mediaCount ? `MEDIA_COUNT: ${mediaCount}` : null,
        mediaCount ? `MEDIA: ${mediaList}` : null
      ].filter(Boolean).join("\n");

      const body = (sec.content || "").trim();

      const fullText = (header + (body ? `\nTEXT: ${body}` : "")).trim();

      // If long, chunk while keeping header context
      if (fullText.split(/\s+/).length > CHUNK_SIZE) {
        const parts = chunkWords(body);
        for (const p of parts) {
          list.push(`${header}\nTEXT: ${p}`);
        }
      } else {
        list.push(fullText);
      }
    });

    return list.filter(t => t && t.trim().length > 0);
  }

  function cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  // ---------------------------
  // Fetch narrative (from manifest or direct)
  // ---------------------------
  function getPackageBase(manifestUrl) {
    return manifestUrl.replace(/\/manifest\.json(\?.*)?$/i, "");
  }
  function toPackageUrl(pkgBase, rel) {
    if (!rel) return "";
    if (/^https?:\/\//i.test(rel)) return rel;
    return `${pkgBase}/${rel.replace(/^\/+/, "")}`;
  }

  async function ensureNarrativeLoaded() {
    if (narrative && Array.isArray(narrative.content)) return;

    const params = new URLSearchParams(window.location.search);
    const manifestUrl = params.get("manifest");
    const directNarrative = params.get("narrative");

    if (directNarrative) {
      const resp = await fetch(directNarrative, { cache: "no-store" });
      if (!resp.ok) throw new Error(`Failed to fetch narrative (${resp.status})`);
      narrative = await resp.json();
    } else {
      if (!manifestUrl) throw new Error("Missing ?manifest=... or ?narrative=...");
      const manifestResp = await fetch(manifestUrl, { cache: "no-store" });
      if (!manifestResp.ok) throw new Error(`Failed to fetch manifest (${manifestResp.status})`);
      const manifest = await manifestResp.json();
      if (!manifest.assets || !manifest.assets.narrative)
        throw new Error("Manifest does not contain 'assets.narrative'.");

      const pkgBase = getPackageBase(manifestUrl);
      const narrativeUrl = toPackageUrl(pkgBase, manifest.assets.narrative);
      const narrativeResp = await fetch(narrativeUrl, { cache: "no-store" });
      if (!narrativeResp.ok) throw new Error(`Failed to fetch narrative (${narrativeResp.status})`);
      narrative = await narrativeResp.json();
    }

    // track globally for compatibility
    window.agent._narrative = narrative;
    storyLanguage = getLangFromCode(narrative.language);
  }

  // ---------------------------
  // Embeddings API
  // ---------------------------
  async function embedMany(texts) {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Embeddings error: ${resp.status} ${errText}`);
    }
    const data = await resp.json();
    return data.data.map(d => d.embedding);
  }

  async function embedOne(text) {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Embeddings error: ${resp.status} ${errText}`);
    }
    const data = await resp.json();
    return data.data[0].embedding;
  }

  async function buildIndex() {
    if (blocks.length === 0) {
      blocks = buildFlattenedBlocks(narrative);
    }
    
    if (blocks.length === 0) {
      isIndexBuilt = true;
      return;
    }
    
    vectors = await embedMany(blocks);
    isIndexBuilt = true;
  }

  async function retrieveContext(question) {
    if (!isIndexBuilt) await buildIndex();
    if (!blocks.length) return "";
    const qVec = await embedOne(question);
    const scored = blocks.map((c, i) => ({ c, s: cosineSim(qVec, vectors[i]) }));
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, TOP_K).map(x => x.c).join("\n\n");
  }

  // ---------------------------
  // Chat API
  // ---------------------------
  function systemPromptFor(lang) {
    const fallback = {
      it: {
        style: "Sei un narratore che racconta la storia basandosi solo sul CONTEXT fornito. " +
          "Parla in modo fluido e naturale, come se stessi leggendo un libro o narrando a voce. " +
          "Se trovi la risposta nel CONTEXT, raccontala senza dire esplicitamente che proviene dal testo. " +
          "Se l’informazione non è presente, spiega gentilmente che non è specificata, " +
          "ma guida comunque l’utente offrendo dettagli correlati che compaiono nella storia, " +
          "o proponendo cosa potrebbe chiedere per approfondire. " +
          "Rispondi sempre in italiano."
      },
      en: {
        style: "You are a narrator who tells the story strictly based on the CONTEXT provided. " +
          "Speak naturally, as if reading a book aloud. " +
          "If the answer is in CONTEXT, narrate it smoothly without stating that it comes from the text. " +
          "If the information is missing, gently explain it is not specified, " +
          "but guide the user by offering related details from the story " +
          "or suggesting what they might ask to explore further. " +
          "Always respond in English."
      },
      es: {
        style: "Eres un narrador que cuenta la historia basándose únicamente en el CONTEXTO proporcionado. " +
          "Habla de forma fluida y natural, como si leyeras un libro en voz alta. " +
          "Si la respuesta está en el CONTEXTO, narra sin decir que proviene del texto. " +
          "Si falta la información, indícalo con amabilidad, " +
          "pero guía al usuario ofreciendo detalles relacionados de la historia " +
          "o sugiriendo qué podría preguntar para profundizar. " +
          "Responde siempre en español."
      },
      fr: {
        style: "Vous êtes un narrateur qui raconte l’histoire uniquement à partir du CONTEXTE fourni. " +
          "Parlez de manière fluide et naturelle, comme si vous lisiez un livre à voix haute. " +
          "Si la réponse est dans le CONTEXTE, racontez-la sans dire qu’elle vient du texte. " +
          "Si l’information est absente, expliquez-le avec bienveillance, " +
          "mais guidez l’utilisateur en offrant des détails connexes de l’histoire " +
          "ou en suggérant ce qu’il pourrait demander pour approfondir. " +
          "Répondez toujours en français."
      },
      de: {
        style: "Du bist ein Erzähler, der die Geschichte ausschließlich auf der Grundlage des bereitgestellten KONTEXTS erzählt. " +
          "Sprich flüssig und natürlich, als würdest du ein Buch laut vorlesen. " +
          "Wenn die Antwort im KONTEXT steht, erzähle sie, ohne zu erwähnen, dass sie aus dem Text stammt. " +
          "Wenn die Information fehlt, erkläre es freundlich, " +
          "führe den Benutzer aber weiter, indem du verwandte Details aus der Geschichte anbietest " +
          "oder vorschlägst, was er fragen könnte, um mehr zu erfahren. " +
          "Antworte immer auf Deutsch."
      }
    };

    const msg = fallback[lang] ?? fallback.en;
    return msg.style;
  }

  async function ask(question) {
    const context = await retrieveContext(question);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPromptFor(storyLanguage) },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}` }
        ]
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`Chat error: ${resp.status} ${errText}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  }

  // ---------------------------
  // Chat UI
  // ---------------------------
  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `chat-message ${role}`;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addTyping() {
    const div = document.createElement("div");
    div.className = "chat-message ai typing";
    div.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function replaceTyping(text) {
    const typing = chatMessages.querySelector(".chat-message.ai.typing");
    if (typing) {
      typing.classList.remove("typing");
      typing.textContent = text;
    }
  }

  async function sendMessage() {
    const q = (textarea.value || "").trim();
    if (!q) return;
    addMessage("user", q);
    textarea.value = "";
    addTyping();
    try {
      const a = await ask(q);
      replaceTyping(a || ""); // allow empty but replace typing
    } catch (err) {
      console.error(err);
      replaceTyping("⚠️ An error occurred while asking the narrator.");
    }
  }

  // ---------------------------
  // Wiring
  // ---------------------------
  fab?.addEventListener("click", async () => {
    panel.classList.add("open");

    // Load API key from sessionStorage
    const stored = sessionStorage.getItem("openai_key");
    if (stored && !apiKey) apiKey = stored;

    if (!apiKey) {
      apiKeyStep.style.display = "block";
      chatStep.style.display = "none";
      return;
    }

    // Ensure narrative & index
    try {
      await ensureNarrativeLoaded();
      if (!isIndexBuilt) {
        await buildIndex();
      }
      apiKeyStep.style.display = "none";
      chatStep.style.display = "flex";
    } catch (e) {
      console.error(e);
      addMessage("ai", "⚠️ Unable to load or index the story.");
    }
  });

  closeBtn?.addEventListener("click", () => panel.classList.remove("open"));

  btnEnable?.addEventListener("click", async () => {
    console.log("Enable Narrator clicked");
    apiKey = (document.getElementById("apiKey")?.value || "").trim();
    if (!apiKey) {
      alert("Please enter an OpenAI API key.");
      return;
    }
    
    console.log("API key saved, loading narrative...");
    // Save to sessionStorage only
    sessionStorage.setItem("openai_key", apiKey);

    // Disable button and show loading
    btnEnable.disabled = true;
    const originalText = btnEnable.textContent;
    
    try {
      await ensureNarrativeLoaded();
      console.log("Narrative loaded, building index...");
      
      // Show progress in button
      blocks = buildFlattenedBlocks(narrative);
      const blockCount = blocks.length;
      btnEnable.textContent = storyLanguage.startsWith("it")
        ? `Generazione embeddings... (${blockCount} blocchi)`
        : `Generating embeddings... (${blockCount} blocks)`;
      
      await buildIndex(false);
      console.log("Index built, switching to chat view");
      apiKeyStep.style.display = "none";
      chatStep.style.display = "flex";
    } catch (e) {
      console.error(e);
      btnEnable.disabled = false;
      btnEnable.textContent = originalText;
      alert("⚠️ Unable to load or index the story. Check console for details.");
    }
  });

  btnAsk?.addEventListener("click", sendMessage);

  // Forget key button
  document.getElementById('btnForgetKey')?.addEventListener('click', () => {
    sessionStorage.removeItem('openai_key');
    apiKey = null;
    alert('API key removed.');
  });

  textarea?.addEventListener("keydown", (e) => {
    // Enter = send; Shift/Alt+Enter = newline
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Resizing (desktop only)
  if (resizeHandle) {
    resizeHandle.addEventListener("mousedown", () => {
      isResizing = true;
      document.body.style.cursor = "ew-resize";
    });
    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 280 && newWidth < 600) {
        panel.style.width = newWidth + "px";
      }
    });
    window.addEventListener("mouseup", () => {
      isResizing = false;
      document.body.style.cursor = "";
    });
  }

  // ---------------------------
  // Public API (compatibility)
  // ---------------------------
  function setNarrative(n) {
    narrative = n;
    window.agent._narrative = n;
    storyLanguage = getLangFromCode(n?.language);
    isIndexBuilt = false;
    blocks = [];
    vectors = [];
  }

  return { setNarrative };
})();

// If the narrative was loaded before the agent, hand it off now
try {
  if (window.pendingNarrative && window.agent && typeof window.agent.setNarrative === "function") {
    window.agent.setNarrative(window.pendingNarrative);
  }
} catch {}
